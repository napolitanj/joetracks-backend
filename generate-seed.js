import fs from 'fs';

const data = JSON.parse(fs.readFileSync('../../joetracks/src/data/portfolio.json', 'utf-8'));

const sql = data
	.map(
		(item) => `
INSERT INTO portfolio (title, description, imageUrl, link, link_text)
VALUES ("${item.title}", "${item.description}", "${item.image_url}", "${item.link}", "${item.link_text}");

`
	)
	.join('\n');

fs.writeFileSync('seed-portfolio.sql', sql);
console.log('✅ seed-portfolio.sql created');
