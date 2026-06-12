import Koa from "koa";
import bodyParser from "koa-bodyparser";
import Router from "@koa/router";

export function createServer(router: Router): Koa {
  const app = new Koa();
  app.use(bodyParser());
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
}
