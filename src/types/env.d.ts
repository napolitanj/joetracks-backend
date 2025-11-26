export type Env = {
	DB: D1Database;
	R2_BUCKET: R2Bucket;
	ADMIN_PASSWORD: string;
	JWT_SECRET: string;
	WEATHER_CACHE: KVNamespace;
};
