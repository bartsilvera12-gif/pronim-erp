/**
 * Errores tipados del flujo /api/atencion/confirmar.
 *
 * `ValidationError` = fallas de contrato/negocio que deben responder 400
 * (cupón inválido, beneficio inexistente, monto sobre máximo, sucursal
 * mismatch, etc). Se distinguen del 500 genérico por su tipo + un
 * `code` estable que el frontend puede matchear sin parsear strings.
 *
 * `IdempotencyConflictError` = misma idempotency_key con payload distinto.
 * Debe responder 409. Es un caso separado porque no es un error de
 * validación del contenido sino del flujo de reintento.
 */

export class ValidationError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message = "IDEMPOTENCY_CONFLICT: la misma idempotency_key llegó con un payload distinto. Generá una key nueva.") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

/** Type guard barato para el catch del endpoint. */
export function isValidationError(e: unknown): e is ValidationError {
  return e instanceof ValidationError;
}
export function isIdempotencyConflictError(e: unknown): e is IdempotencyConflictError {
  return e instanceof IdempotencyConflictError;
}
