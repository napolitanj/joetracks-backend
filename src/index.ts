import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';

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
	const { password } = await c.req.json<{ password: string }>();
	if (password !== c.env.ADMIN_PASSWORD) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Expire in 1 hour (3600 seconds)
	const exp = Math.floor(Date.now() / 1000) + 60 * 60;

	const token = await sign({ admin: true, exp }, c.env.JWT_SECRET);
	return c.json({ token, expires_in: '1h' });
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

// new route: portfolio
app.get('/api/portfolio', async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT id, title, description, imageUrl, link, link_text AS linkText 
     FROM portfolio ORDER BY id DESC`
	).all();
	return c.json(results);
});

// add portfolio
app.post('/api/portfolio', requireAuth, async (c) => {
	const body = await c.req.json();
	const { title, description, imageUrl, link, linkText } = body;

	await c.env.DB.prepare(
		`INSERT INTO portfolio (title, description, imageUrl, link, link_text)
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
     SET title = ?, description = ?, imageUrl = ?, link = ?, link_text = ?, updated_at = CURRENT_TIMESTAMP
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

import { v4 as uuidv4 } from 'uuid';

app.post('/api/upload', requireAuth, async (c) => {
	const contentType = c.req.header('content-type') || '';
	if (!contentType.startsWith('multipart/form-data')) {
		return c.json({ error: 'Invalid content type' }, 400);
	}

	const formData = await c.req.formData();
	const file = formData.get('file');
	if (!file || typeof file === 'string') {
		return c.json({ error: 'No file uploaded' }, 400);
	}

	// Create unique filename
	const extension = file.name.split('.').pop();
	const key = `${uuidv4()}.${extension}`;

	// Upload to R2
	await c.env.R2_BUCKET.put(key, file.stream(), {
		httpMetadata: { contentType: file.type },
	});

	// Construct the public URL using your R2 public domain
	const publicUrl = `https://pub-59c9aabb45a74ed489e0eaea1802c581.r2.dev/${key}`;

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

app.get('/api/health', (c) => c.text('ok'));

export default app;
