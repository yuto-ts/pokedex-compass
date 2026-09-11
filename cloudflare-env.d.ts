/// <reference types="vite/client" />
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
  }
}
