import "dotenv/config";
import { AlchemyEnvSchema, BaseSchema } from "./schemas";

export const env = BaseSchema.parse(process.env);

export function getAlchemyEnv() {
  return AlchemyEnvSchema.parse(process.env);
}
