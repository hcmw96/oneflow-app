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
  mat_access?: boolean;
  towel_access?: boolean;
};

/** The Seeker — `products.id` prefix `df5794ea`. */
export const THE_SEEKER_PRODUCT_ID_PREFIX = "df5794ea";

/** The Sage — `products.id` prefix `e8ea33ba`. */
export const THE_SAGE_PRODUCT_ID_PREFIX = "e8ea33ba";

const SEEKER_YOGA_CLASS_TYPES = [
  "yoga",
  "sculpt",
  "pilates",
  "power",
  "beginner",
  "beginner_sculpt",
  "event",
] as const;

const WELLZONE_CLASS_TYPES = ["wellzone", "sauna_journey"] as const;

const UNLIMITED_CREDITS = 999;

export function isTheSeekerProduct(productId: string, productName: string): boolean {
  const id = productId.trim().toLowerCase();
  const name = productName.trim().toLowerCase();
  return id.startsWith(THE_SEEKER_PRODUCT_ID_PREFIX) || name.includes("seeker");
}

export function isTheSageProduct(productId: string, productName: string): boolean {
  const id = productId.trim().toLowerCase();
  const name = productName.trim().toLowerCase();
  return id.startsWith(THE_SAGE_PRODUCT_ID_PREFIX) || name.includes("sage");
}

export function isMultiCreditBundleProduct(productId: string, productName: string): boolean {
  return isTheSeekerProduct(productId, productName) || isTheSageProduct(productId, productName);
}

/** Standalone add-ons assigned without bundle splitting. */
export function getStandaloneCreditFlags(productName: string): Partial<UserCreditInsertRow> {
  const n = productName.trim().toLowerCase();
  if (
    n.includes("mat monthly") ||
    n.includes("mat storage") ||
    (n.includes("mat") && n.includes("access"))
  ) {
    return { mat_access: true };
  }
  if (
    n.includes("towel monthly") ||
    n.includes("towel access") ||
    n === "towel" ||
    n.startsWith("towel ")
  ) {
    return { towel_access: true };
  }
  return {};
}

export function getExtraCreditsForProduct(
  productId: string,
  productName: string,
  profileId: string,
  expiresAt: string | null,
  paymentId: string,
): UserCreditInsertRow[] {
  const extras: UserCreditInsertRow[] = [];

  if (isTheSeekerProduct(productId, productName)) {
    extras.push({
      profile_id: profileId,
      product_id: productId,
      product_name: "The Seeker - Wellzone",
      category: "wellzone",
      allowed_class_types: [...WELLZONE_CLASS_TYPES],
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

  if (isTheSageProduct(productId, productName)) {
    extras.push({
      profile_id: profileId,
      product_id: productId,
      product_name: "The Sage - Wellzone",
      category: "wellzone",
      allowed_class_types: [...WELLZONE_CLASS_TYPES],
      credits_total: UNLIMITED_CREDITS,
      credits_remaining: UNLIMITED_CREDITS,
      is_unlimited: true,
      expires_at: expiresAt,
      yoco_payment_id: paymentId,
    });
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

export function getMainCreditOverridesForProduct(
  productId: string,
  productName: string,
): Partial<UserCreditInsertRow> | null {
  if (isTheSeekerProduct(productId, productName)) {
    return {
      product_name: "The Seeker - Yoga",
      category: "yoga",
      allowed_class_types: [...SEEKER_YOGA_CLASS_TYPES],
      credits_total: UNLIMITED_CREDITS,
      credits_remaining: UNLIMITED_CREDITS,
      is_unlimited: true,
      mat_access: true,
      towel_access: true,
    };
  }

  if (isTheSageProduct(productId, productName)) {
    return {
      product_name: "The Sage - Yoga",
      category: "yoga",
      credits_total: UNLIMITED_CREDITS,
      credits_remaining: UNLIMITED_CREDITS,
      is_unlimited: true,
      mat_access: true,
      towel_access: true,
    };
  }

  return null;
}

export type BundleComponentKind = "yoga" | "wellzone" | "cafe" | "mat" | "towel";

export const BUNDLE_COMPONENT_OPTIONS: { value: BundleComponentKind; label: string }[] = [
  { value: "yoga", label: "Yoga" },
  { value: "wellzone", label: "Wellzone" },
  { value: "cafe", label: "Café" },
  { value: "mat", label: "Mat Storage" },
  { value: "towel", label: "Towel Service" },
];

export function resolveBundlePackageTitle(productId: string, rows: { product_name: string | null }[]): string {
  if (isTheSeekerProduct(productId, "")) return "The Seeker";
  if (isTheSageProduct(productId, "")) return "The Sage";
  for (const row of rows) {
    const name = row.product_name ?? "";
    if (isTheSeekerProduct(productId, name)) return "The Seeker";
    if (isTheSageProduct(productId, name)) return "The Sage";
  }
  return rows[0]?.product_name?.split(" - ")[0]?.trim() || "Package";
}

export function creditRowBelongsToBundle(
  row: { product_id?: string | null; product_name?: string | null },
): boolean {
  const pid = row.product_id?.trim();
  if (!pid) return false;
  return isMultiCreditBundleProduct(pid, row.product_name ?? "");
}

export function bundleComponentSortKey(row: {
  product_name?: string | null;
  category?: string | null;
  mat_access?: boolean | null;
  towel_access?: boolean | null;
}): number {
  const name = (row.product_name ?? "").toLowerCase();
  if (row.mat_access || name.includes("mat")) return 4;
  if (row.towel_access || name.includes("towel")) return 5;
  if (row.category === "cafe" || name.includes("café") || name.includes("cafe")) return 3;
  if (row.category === "wellzone" || name.includes("wellzone") || name.includes("sauna")) return 2;
  return 1;
}

export function buildBundleComponentCreditRow(args: {
  profileId: string;
  productId: string;
  bundleTitle: string;
  component: BundleComponentKind;
  creditsTotal: number;
  creditsRemaining: number;
  isUnlimited: boolean;
  expiresAt: string | null;
  paymentId?: string;
  purchasedAt?: string;
}): UserCreditInsertRow {
  const paymentId = args.paymentId ?? "manual_component";
  const title = args.bundleTitle.trim();
  const base: UserCreditInsertRow = {
    profile_id: args.profileId,
    product_id: args.productId,
    product_name: title,
    category: "yoga",
    allowed_class_types: [],
    credits_total: args.creditsTotal,
    credits_remaining: args.creditsRemaining,
    is_unlimited: args.isUnlimited,
    expires_at: args.expiresAt,
    yoco_payment_id: paymentId,
    mat_access: false,
    towel_access: false,
    ...(args.purchasedAt ? { purchased_at: args.purchasedAt } : {}),
  };

  switch (args.component) {
    case "yoga":
      return {
        ...base,
        product_name: `${title} - Yoga`,
        category: "yoga",
        allowed_class_types: [...SEEKER_YOGA_CLASS_TYPES],
      };
    case "wellzone":
      return {
        ...base,
        product_name: `${title} - Wellzone`,
        category: "wellzone",
        allowed_class_types: [...WELLZONE_CLASS_TYPES],
      };
    case "cafe":
      return {
        ...base,
        product_name: `${title} - Café`,
        category: "cafe",
        allowed_class_types: [],
      };
    case "mat":
      return {
        ...base,
        product_name: `${title} - Mat Storage`,
        category: "yoga",
        allowed_class_types: [],
        mat_access: true,
      };
    case "towel":
      return {
        ...base,
        product_name: `${title} - Towel Service`,
        category: "yoga",
        allowed_class_types: [],
        towel_access: true,
      };
    default:
      return base;
  }
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
    mat_access: false,
    towel_access: false,
    ...(args.purchasedAt ? { purchased_at: args.purchasedAt } : {}),
  };

  const bundleOverrides = getMainCreditOverridesForProduct(args.productId, args.productName);
  let mergedMain = bundleOverrides ? { ...main, ...bundleOverrides } : main;

  if (!bundleOverrides) {
    const standalone = getStandaloneCreditFlags(args.productName);
    mergedMain = { ...mergedMain, ...standalone };
    const n = args.productName.trim().toLowerCase();
    if (n.includes("café") || n.includes("cafe")) {
      mergedMain = {
        ...mergedMain,
        category: "cafe",
        credits_total: mergedMain.credits_total > 0 ? mergedMain.credits_total : 10,
        credits_remaining: mergedMain.credits_remaining > 0 ? mergedMain.credits_remaining : 10,
        is_unlimited: false,
      };
    }
  }

  const extras = getExtraCreditsForProduct(
    args.productId,
    args.productName,
    args.profileId,
    args.expiresAt,
    args.paymentId,
  ).map((row) => ({
    ...row,
    ...(args.purchasedAt ? { purchased_at: args.purchasedAt } : {}),
  }));

  return [mergedMain, ...extras];
}
