export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
    public details?: unknown,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, "bad_request", details);
export const notFound = (what = "Resource") => new ApiError(404, `${what} not found`, "not_found");
export const conflict = (msg: string, details?: unknown) => new ApiError(409, msg, "conflict", details);
