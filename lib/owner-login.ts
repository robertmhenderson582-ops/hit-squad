export const OWNER_LOGIN_EMAIL = "robertmhenderson582@gmail.com";

export function isOwnerLoginEmail(email: string): boolean {
  return email.trim().toLowerCase() === OWNER_LOGIN_EMAIL;
}
