declare module "express-serve-static-core" {
  interface Request {
    auth?: import("../lib/jwt.js").AccessTokenPayload;
    env?: import("../config/env.js").Env;
  }
}

export {};
