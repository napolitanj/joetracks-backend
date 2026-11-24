export {};

declare global {
	interface Env {
		DB: D1Database;
		JWT_SECRET: string;
		ADMIN_PASSWORD: string;
		R2_BUCKET: R2Bucket;
	}
}
