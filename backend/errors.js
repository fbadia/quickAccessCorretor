/**
 * Erro cuja mensagem foi escrita para o usuário final e pode ser devolvida na resposta HTTP.
 * Qualquer outro erro (banco, Storage, APIs externas) é respondido com uma mensagem genérica,
 * para não expor detalhes internos como nomes de colunas ou constraints.
 */
export class UserFacingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

/**
 * Converte um erro em { status, message } seguro para a resposta HTTP.
 * @param {Error} err
 * @param {string} genericMessage Mensagem usada quando o erro não é UserFacingError.
 */
export function toHttpError(err, genericMessage) {
  if (err instanceof UserFacingError) return { status: err.status, message: err.message };
  return { status: 500, message: genericMessage };
}
