export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what) => new HttpError(404, 'NOT_FOUND', `${what} não encontrado(a).`);

/** Valida `data` com um schema zod e lança HttpError 400 se inválido. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Dados inválidos.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export function errorHandler(err, _req, reply) {
  if (err instanceof HttpError) {
    return reply
      .status(err.status)
      .send({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.validation || err.statusCode === 400) {
    return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
  reply.log.error(err);
  return reply
    .status(500)
    .send({ error: { code: 'INTERNAL', message: 'Erro interno do servidor.' } });
}
