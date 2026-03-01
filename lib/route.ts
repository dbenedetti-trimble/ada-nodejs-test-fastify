'use strict'

interface RoutingApi {
  setup(options: any, fastifyArgs: any): void;
  routing: (req: any, res: any, ctx: any) => void;
  route(opts: { options: any; isFastify: boolean }): void;
  hasRoute(opts: { options: any }): boolean;
  prepareRoute(opts: { method: any; url: any; options: any; handler?: any; isFastify: boolean }): any;
  routeHandler(req: any, res: any, params: any, context: any, query: any): void;
  closeRoutes(): void;
  printRoutes(opts?: any): string;
  addConstraintStrategy(strategy: any): void;
  hasConstraintStrategy(strategyName: string): boolean;
  isAsyncConstraint(): boolean;
  findRoute(opts: { method: string; url: string; constraints?: any }): { handler: any; params: any; searchParams: any } | null;
}

// TODO(features): replace stub with full implementation ported from original lib/route.js
function buildRouting (_options: any): RoutingApi {
  return null as unknown as RoutingApi
}

// TODO(features): replace stub with full implementation ported from original lib/route.js
function validateBodyLimitOption (_bodyLimit: any): void {
  // placeholder
}

// TODO(features): replace stub with full implementation ported from original lib/route.js
function buildRouterOptions (_options: any, _defaultOptions: any): any {
  return null
}

module.exports = { buildRouting, validateBodyLimitOption, buildRouterOptions }
