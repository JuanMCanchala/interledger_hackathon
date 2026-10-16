/** Error with an HTTP status that is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}
