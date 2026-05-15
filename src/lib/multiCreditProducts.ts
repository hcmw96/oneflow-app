/** Rows inserted into `user_credits` for a product purchase or manual assign. */
export type UserCreditInsertRow = {
  profile_id: string;
  product_id: string;
  product_name: string;
  category: string;
  allowed_class_types: string[];
  credits_total: number;
  credits_remaining: number;
  is_unlimited: boolean;
  expires_at: string | null;
  yoco_payment_id: string;
  purchased_at?: string;
};

const SEEKER_YOGA_CLASS_TYPES = [
  "yoga",
  "sculpt",
  "pilates",
  "power",
  "beginner",
  "beginner_sculpt",
  "event",
] as const;

export function isSeekerProductName(productName: string): boolean {
  return productName.toLowerCase().includes("seeker");
}

export function isSageProductName(productName: string): boolean {
  return productName.toLowerCase().includes("sage");
}

export function isMultiCreditProductName(productName: string): boolean {
  return isSeekerProductName(productName) || isSageProductName(productName);
}

export function getExtraCreditsForProduct(
  productName: string,
  profileId: string,
  productId: string,
  expiresAt: string | null,
  paymentId: string,
): UserCreditInsertRow[] {
  const extras: UserCreditInsertRow[] = [];
  const lower = productName.toLowerCase();

  if (lower.includes("seeker")) {
    extras.push({
      profile_id: profileId,
      product_id: productId,
      product_name: "The Seeker - Wellzone",
      category: "wellzone",
      allowed_class_types: ["wellzone", "sauna_journey"],
      credits_total: 10,
      credits_remaining: 10,
      is_unlimited: false,
      expires_at: expiresAt,
      yoco_payment_id: paymentId,
    });
    extras.push({
      profile_id: profileId,
      product_id: productId,
      product_name: "The Seeker - Café",
      category: "cafe",
      allowed_class_types: [],
      credits_total: 10,
      credits_remaining: 10,
      is_unlimited: false,
      expires_at: expiresAt,
      yoco_payment_id: paymentId,
    });
  }

  if (lower.includes("sage")) {
    extras.push({
      profile_id: profileId,
      product_id: productId,
      product_name: "The Sage - Café",
      category: "cafe",
      allowed_class_types: [],
      credits_total: 10,
      credits_remaining: 10,
      is_unlimited: false,
      expires_at: expiresAt,
      yoco_payment_id: paymentId,
    });
  }

  return extras;
}

/** Overrides for the primary row when a bundle maps to multiple `user_credits` rows. */
export function getMainCreditOverridesForProduct(
  productName: string,
): Partial<UserCreditInsertRow> | null {
  if (!isSeekerProductName(productName)) return null;
  return {
    product_name: "The Seeker - Yoga",
    category: "yoga",
    allowed_class_types: [...SEEKER_YOGA_CLASS_TYPES],
    credits_total: 999,
    credits_remaining: 999,
    is_unlimited: true,
  };
}

export function buildProductCreditRows(args: {
  productName: string;
  profileId: string;
  productId: string;
  expiresAt: string | null;
  paymentId: string;
  purchasedAt?: string;
  category: string;
  allowedClassTypes: string[];
  creditsTotal: number;
  creditsRemaining: number;
  isUnlimited: boolean;
}): UserCreditInsertRow[] {
  const main: UserCreditInsertRow = {
    profile_id: args.profileId,
    product_id: args.productId,
    product_name: args.productName,
    category: args.category,
    allowed_class_types: args.allowedClassTypes,
    credits_total: args.creditsTotal,
    credits_remaining: args.creditsRemaining,
    is_unlimited: args.isUnlimited,
    expires_at: args.expiresAt,
    yoco_payment_id: args.paymentId,
    ...(args.purchasedAt ? { purchased_at: args.purchasedAt } : {}),
  };

  const overrides = getMainCreditOverridesForProduct(args.productName);
  const mergedMain = overrides ? { ...main, ...overrides } : main;

  const extras = getExtraCreditsForProduct(
    args.productName,
    args.profileId,
    args.productId,
    args.expiresAt,
    args.paymentId,
  ).map((row) => ({
    ...row,
    ...(args.purchasedAt ? { purchased_at: args.purchasedAt } : {}),
  }));

  return [mergedMain, ...extras];
}
