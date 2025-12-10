import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { refreshAllForecasts } from './services/forecast/refreshAll';
import { v4 as uuidv4 } from 'uuid';
import { ski } from './routes/ski';
import type { Env } from './types/env';
import type { Region } from './services/forecast/getResortsByRegion';


const app = new Hono<{ Bindings: Env }>();

app.use(
	'*',
	cors({
		origin: '*',
		allowHeaders: ['Authorization', 'Content-Type'],
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	})
);
// login
app.post('/api/login', async (c) => {
	try {
		const { password } = await c.req.json<{ password: string }>();
		if (password !== c.env.ADMIN_PASSWORD) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const exp = Math.floor(Date.now() / 1000) + 60 * 60;
		const token = await sign({ admin: true, exp }, c.env.JWT_SECRET);

		return c.json({ token, expires_in: '1h' });
	} catch (err) {
		return c.json({ error: 'Internal Server Error', details: String(err) }, 500);
	}
});

// Verify an existing JWT
app.get('/api/verify', async (c) => {
	const authHeader = c.req.header('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return c.json({ valid: false, error: 'Missing token' }, 401);
	}

	const token = authHeader.split(' ')[1];

	try {
		const payload = await verify(token, c.env.JWT_SECRET);
		if (!payload || !payload.admin) {
			return c.json({ valid: false }, 401);
		}
		return c.json({ valid: true });
	} catch (err) {
		return c.json({ valid: false, error: 'Invalid or expired token' }, 401);
	}
});

// verify middleware
async function requireAuth(c: any, next: any) {
	const authHeader = c.req.header('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return c.json({ error: 'Missing or malformed token' }, 401);
	}

	const token = authHeader.split(' ')[1];

	try {
		const payload = await verify(token, c.env.JWT_SECRET);

		// Ensure token belongs to an admin
		if (!payload || !payload.admin) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		// 🔒 Check for expiration (1 hour max)
		if (payload.exp && Date.now() / 1000 > payload.exp) {
			return c.json({ error: 'Token expired' }, 401);
		}

		// Token valid → continue
		await next();
	} catch (err) {
		return c.json({ error: 'Invalid or expired token' }, 401);
	}
}

// ✅ Protect all /api/pages routes
app.use('/api/pages/*', requireAuth);

// get page
app.get('/api/pages', requireAuth, async (c) => {
	const siteId = c.req.query('siteId');
	const path = c.req.query('path') || '/';
	if (!siteId) return c.json({ error: 'siteId required' }, 400);

	const row = await c.env.DB.prepare(`SELECT id, site_id, path, data, updated_at FROM pages WHERE site_id=? AND path=?`)
		.bind(siteId, path)
		.first();

	if (!row) return c.json({ error: 'Not found' }, 404);

	const page = {
		...row,
		data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
	};

	return c.json(page);
});

// add portfolio
app.post('/api/portfolio', requireAuth, async (c) => {
	const body = await c.req.json();
	const { title, description, imageUrl, link, linkText } = body;

	await c.env.DB.prepare(
		`INSERT INTO portfolio (title, description, imageUrl, link, linkText)
     VALUES (?, ?, ?, ?, ?)`
	)
		.bind(title, description, imageUrl, link, linkText)
		.run();

	return c.json({ success: true });
});

// update portfolio
app.put('/api/portfolio/:id', requireAuth, async (c) => {
	const id = c.req.param('id');
	const body = await c.req.json();
	const { title, description, imageUrl, link, linkText } = body;

	await c.env.DB.prepare(
		`UPDATE portfolio
     SET title = ?, description = ?, imageUrl = ?, link = ?, linkText = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
	)
		.bind(title, description, imageUrl, link, linkText, id)
		.run();

	return c.json({ success: true });
});

// delete portfolio
app.delete('/api/portfolio/:id', requireAuth, async (c) => {
	const id = c.req.param('id');

	await c.env.DB.prepare(`DELETE FROM portfolio WHERE id = ?`).bind(id).run();

	return c.json({ success: true });
});

app.post('/api/upload', requireAuth, async (c) => {
	const contentType = c.req.header('content-type') || '';
	if (!contentType.startsWith('multipart/form-data')) {
		return c.json({ error: 'Invalid content type' }, 400);
	}

	const formData = await c.req.formData();
	const file = formData.get('file') as File | null;

	if (!file) {
		return c.json({ error: 'No file uploaded' }, 400);
	}

	// Create unique filename
	const extension = file.name.split('.').pop();
	const key = `${uuidv4()}.${extension}`;

	// Upload to R2
	const arrayBuffer = await file.arrayBuffer();
	await c.env.R2_BUCKET.put(key, arrayBuffer, {
		httpMetadata: { contentType: file.type },
	});

	// Construct the public URL using your R2 public domain
	const publicUrl = `https://pub-40be4b5605764c50a95c4586fcc2b2d0.r2.dev/${key}`;

	return c.json({ success: true, url: publicUrl });
});

// upsert page
app.put('/api/pages', requireAuth, async (c) => {
	const body = await c.req.json<{ siteId: string; path: string; data: unknown }>();
	if (!body?.siteId || !body?.path) return c.json({ error: 'Invalid body' }, 400);

	const id = crypto.randomUUID();
	const now = Date.now();
	await c.env.DB.prepare(
		`INSERT INTO pages (id, site_id, path, data, updated_at)
     VALUES (?, ?, ?, json(?), ?)
     ON CONFLICT(site_id, path)
     DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`
	)
		.bind(id, body.siteId, body.path, JSON.stringify(body.data ?? {}), now)
		.run();

	return c.json({ ok: true, updated_at: now });
});

app.get('/api/test-r2', async (c) => {
	try {
		await c.env.R2_BUCKET.put('test.txt', 'R2 connection OK');
		return c.text('✅ R2 bucket write succeeded');
	} catch (err) {
		console.error('R2 test error:', err);
		return c.text(`❌ R2 test failed: ${err}`, 500);
	}
});

// ------------------- BLOG ROUTES -------------------

// Public blog routes
app.get('/api/blog', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM blog_posts ORDER BY created_at DESC').all();
	return c.json(results);
});

app.get('/api/blog/:slug', async (c) => {
	const slug = c.req.param('slug');
	const post = await c.env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ?').bind(slug).first();
	if (!post) return c.json({ error: 'Not found' }, 404);
	return c.json(post);
});

// Authenticated blog routes
app.post('/api/blog', requireAuth, async (c) => {
	const { title, slug, content, imageUrl, published } = await c.req.json();
	const id = crypto.randomUUID();
	await c.env.DB.prepare(
		`INSERT INTO blog_posts (id, title, slug, content, imageUrl, published)
     VALUES (?, ?, ?, ?, ?, ?)`
	)
		.bind(id, title, slug, content, imageUrl || '', published ? 1 : 0)
		.run();
	return c.json({ id });
});

app.put('/api/blog/:id', requireAuth, async (c) => {
	const id = c.req.param('id');
	const { title, slug, content, imageUrl, published } = await c.req.json();
	await c.env.DB.prepare(
		`UPDATE blog_posts
     SET title = ?, slug = ?, content = ?, imageUrl = ?, published = ?, updated_at = strftime('%s','now')
     WHERE id = ?`
	)
		.bind(title, slug, content, imageUrl || '', published ? 1 : 0, id)
		.run();
	return c.json({ success: true });
});

app.delete('/api/blog/:id', requireAuth, async (c) => {
	const id = c.req.param('id');
	await c.env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(id).run();
	return c.json({ success: true });
});

// ------------------- PORTFOLIO ROUTES -------------------

app.get('/api/portfolio/:id', async (c) => {
	const id = c.req.param('id');
	const result = await c.env.DB.prepare(
		`SELECT id, title, description, imageUrl, link, linkText, category, type 
     FROM portfolio WHERE id = ?`
	)
		.bind(id)
		.first();

	if (!result) return c.json({ error: 'Not found' }, 404);
	return c.json(result);
});

app.get('/api/portfolio', async (c) => {
	try {
		const db = c.env.DB;
		const category = c.req.query('category');

		let result;

		if (category) {
			result = await db
				.prepare(
					`
          SELECT id, title, description, imageUrl, link, linkText, category, type, sort_order
          FROM portfolio
          WHERE type = 'project'
            AND LOWER(category) = LOWER(?)
          ORDER BY sort_order ASC, id DESC;
        `
				)
				.bind(category)
				.all();
		} else {
			result = await db
				.prepare(
					`
          SELECT id, title, description, imageUrl, link, linkText, category, type, sort_order
          FROM portfolio
          WHERE type = 'category'
          ORDER BY sort_order ASC, id DESC;
        `
				)
				.all();
		}

		return c.json(result.results);
	} catch (err) {
		console.error('Error fetching portfolio:', err);
		return c.json({ error: 'Failed to load portfolio' }, 500);
	}
});

app.route('/api/ski', ski);

app.get('/api/health', (c) => c.text('ok'));

app.get('/api.debug/run-cron', async (c) => {
  const raw = (c.req.query('region') ?? '').toLowerCase();

  const map: Record<string, Region> = {
    'western-up': 'Western UP',
    'eastern-up': 'Eastern UP',
    'northern-lp': 'Northern LP',
    'southern-lp': 'Southern LP',
  };

  const region = map[raw] ?? 'Western UP';

  await refreshAllForecasts(c.env, region);

  return c.json({ ok: true, region });
});

export default {
  fetch(request: Request, env: Env, ctx: any) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: any, env: Env, ctx: any) {
    let region: Region | null = null;

    switch (event.cron) {
      case '0 9 * * *':
        region = 'Western UP';
        break;

      case '5 9 * * *':
        region = 'Eastern UP';
        break;

      case '10 9 * * *':
        region = 'Northern LP';
        break;

      case '15 9 * * *':
        region = 'Southern LP';
        break;

      default:
        console.log('Unknown cron:', event.cron);
        return;
    }

    ctx.waitUntil(refreshAllForecasts(env, region));
  },
};


