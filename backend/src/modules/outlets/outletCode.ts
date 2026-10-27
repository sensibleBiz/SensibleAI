import { randomInt } from "node:crypto";

const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SUFFIX_LENGTH = 4;
const CODE_SPACE = CODE_ALPHABET.length ** SUFFIX_LENGTH;

const encodeSuffix = (value: number) => {
  let remaining = value;
  let suffix = "";
  for (let index = 0; index < SUFFIX_LENGTH; index += 1) {
    suffix = CODE_ALPHABET[remaining % CODE_ALPHABET.length] + suffix;
    remaining = Math.floor(remaining / CODE_ALPHABET.length);
  }
  return suffix;
};

export const createOutletCode = (
  outletName: string,
  randomValue = randomInt(0, CODE_SPACE),
) => {
  const prefix = outletName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "OUT";
  return `${prefix}${encodeSuffix(randomValue)}`;
};
