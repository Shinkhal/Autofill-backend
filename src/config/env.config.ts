import 'dotenv/config';
import { z } from 'zod';

const optionalString = z.preprocess(value => value === '' ? undefined : value, z.string().min(1).optional());
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  MONGODB_DB_NAME: z.string().min(1).default('jobautofill'),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.preprocess(value => value === '' ? undefined : value, z.string().min(32).optional()),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.0-flash'),
  SERVER_URL: z.string().url().regex(/^https?:\/\//),
  CLIENT_URL: z.string().url().regex(/^https?:\/\//),
  RAPIDAPI_KEY: optionalString,
  JOOBLE_API_KEY: optionalString,
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),
  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  UPSTASH_REDIS_TCP_URL: optionalString
}).superRefine((value, ctx) => {
  const issue = (key: string) => ctx.addIssue({ code: 'custom', path: [key], message: 'Invalid configuration' });
  if (Boolean(value.UPSTASH_REDIS_REST_URL) !== Boolean(value.UPSTASH_REDIS_REST_TOKEN)) {
    issue('UPSTASH_REDIS_REST_URL'); issue('UPSTASH_REDIS_REST_TOKEN');
  }
  if (value.UPSTASH_REDIS_REST_URL && !z.string().url().regex(/^https:\/\//).safeParse(value.UPSTASH_REDIS_REST_URL).success) issue('UPSTASH_REDIS_REST_URL');
  if (value.UPSTASH_REDIS_TCP_URL && !z.string().url().regex(value.NODE_ENV === 'production' ? /^rediss:\/\// : /^rediss?:\/\//).safeParse(value.UPSTASH_REDIS_TCP_URL).success) issue('UPSTASH_REDIS_TCP_URL');
});

let config: z.infer<typeof schema> | undefined;
function values() {
  if (!config) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      throw new Error('Invalid environment configuration: ' + [...new Set(result.error.issues.map(issue => issue.path.join('.')))].join(', '));
    }
    config = result.data;
  }
  return config;
}

export const getEnv = {
  app: {
    env: () => values().NODE_ENV,
    isDev: () => values().NODE_ENV === 'development',
    isProd: () => values().NODE_ENV === 'production',
    isTest: () => values().NODE_ENV === 'test',
    port: () => values().PORT,
    url: () => values().SERVER_URL,
    trustProxy: () => values().TRUST_PROXY,
    isDocker: () => process.env.DOCKER === 'true' || process.env.CONTAINER === 'true' || Boolean(process.env.KUBERNETES_SERVICE_HOST)
  },
  client: { url: () => values().CLIENT_URL },
  database: {
    uri: () => values().MONGODB_URI,
    name: () => values().MONGODB_DB_NAME
  },
  jwt: { accessSecret: () => values().JWT_SECRET },
  session: { secret: () => values().SESSION_SECRET ?? values().JWT_SECRET },
  google: {
    clientId: () => values().GOOGLE_CLIENT_ID,
    clientSecret: () => values().GOOGLE_CLIENT_SECRET,
    geminiApiKey: () => values().GOOGLE_GEMINI_API_KEY,
    geminiModel: () => values().GEMINI_MODEL
  },
  redis: {
    enabled: () => Boolean(values().UPSTASH_REDIS_REST_URL),
    url: () => values().UPSTASH_REDIS_REST_URL,
    token: () => values().UPSTASH_REDIS_REST_TOKEN,
    tcpUrl: () => values().UPSTASH_REDIS_TCP_URL
  },
  jobs: {
    rapidApiKey: () => values().RAPIDAPI_KEY,
    joobleApiKey: () => values().JOOBLE_API_KEY
  },
  logging: {
    level: () => values().LOG_LEVEL ?? (values().NODE_ENV === 'test' ? 'silent' : values().NODE_ENV === 'development' ? 'debug' : 'info')
  },
  validate(): void { values(); },
  summary() {
    return {
      environment: this.app.env(), port: this.app.port(), docker: this.app.isDocker(),
      database: this.database.name(), redisHttp: this.redis.enabled(),
      redisTcp: Boolean(this.redis.tcpUrl()), jsearch: Boolean(this.jobs.rapidApiKey()),
      jooble: Boolean(this.jobs.joobleApiKey()), logLevel: this.logging.level()
    };
  }
};
