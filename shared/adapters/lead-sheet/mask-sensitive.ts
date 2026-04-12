const isAllDigits = (value: string) => /^\d+$/.test(value);

export const maskPhoneLike = (value: string) => {
  const raw = value.trim();
  if (!raw) return raw;

  if (isAllDigits(raw) && raw.length >= 7) {
    return `${raw.slice(0, 3)}****${raw.slice(-4)}`;
  }

  if (raw.length <= 4) {
    return `${raw[0] || ""}***`;
  }

  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
};

export const maskPersonLike = (value: string) => {
  const raw = value.trim();
  if (!raw) return raw;

  if (/^[\u4e00-\u9fa5]{2,4}$/u.test(raw)) {
    return `${raw[0]}${"*".repeat(Math.max(raw.length - 1, 1))}`;
  }

  if (raw.length <= 2) {
    return `${raw[0] || ""}*`;
  }

  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
};

export const maskHandleLike = (value: string) => {
  const raw = value.trim();
  if (!raw) return raw;
  if (raw.length <= 4) {
    return `${raw[0] || ""}***`;
  }
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
};

export const maskLeadIdentifier = (value: string) => {
  const raw = value.trim();
  if (!raw) return raw;
  if (isAllDigits(raw)) {
    return maskPhoneLike(raw);
  }
  if (/^[\u4e00-\u9fa5]+$/u.test(raw)) {
    return maskPersonLike(raw);
  }
  return maskHandleLike(raw);
};
