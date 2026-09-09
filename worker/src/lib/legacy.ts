import { thaiBuddhistDate } from './format';

/** Legacy record (LamproundData) — คืน object ที่มี key เป็น Sheet headers เดิม
 *  เพื่อ parity กับ buildRecordFromRow_ (record.BusinessName ฯลฯ)
 *  หมายเหตุ: วันที่ legacy อ่านจากชีตเป็น Date → ไทยพุทธ (buildRecordFromRow_) */
export interface LegacyRecordRow {
  backend_id: string;
  lampround_id: string | null;
  business_name: string;
  owner_name: string;
  phone: string;
  line_id: string;
  facebook: string;
  website: string;
  location_text: string;
  latitude: string;
  longitude: string;
  business_type: string;
  product_category: string;
  business_level: string;
  main_products: string;
  production_capacity: string;
  sales_channel: string;
  avg_price: string;
  business_status: string;
  potential_level: string;
  issues: string;
  support_needed: string;
  image_shop_ref: string;
  image_product_ref: string;
  image_activity_ref: string;
  note: string;
  shop_history: string;
  created_at: string;
  created_by: string;
  is_deleted: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export function legacyRecordToApi(
  row: LegacyRecordRow,
  options: { includeImages: boolean; rowIndex?: number; imageBaseUrl?: string }
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    BackendId: row.backend_id,
    LamproundID: row.lampround_id ?? '',
    BusinessName: row.business_name,
    OwnerName: row.owner_name,
    Phone: row.phone,
    LineID: row.line_id,
    Facebook: row.facebook,
    Website: row.website,
    LocationText: row.location_text,
    Latitude: row.latitude,
    Longitude: row.longitude,
    BusinessType: row.business_type,
    ProductCategory: row.product_category,
    BusinessLevel: row.business_level,
    MainProducts: row.main_products,
    ProductionCapacity: row.production_capacity,
    SalesChannel: row.sales_channel,
    AvgPrice: row.avg_price,
    BusinessStatus: row.business_status,
    PotentialLevel: row.potential_level,
    Issues: row.issues,
    SupportNeeded: row.support_needed,
    Note: row.note,
    ShopHistory: row.shop_history,
    CreatedAt: thaiBuddhistDate(row.created_at),
    CreatedBy: row.created_by,
    IsDeleted: row.is_deleted,
    DeletedAt: row.deleted_at ? thaiBuddhistDate(row.deleted_at) : '',
    DeletedBy: row.deleted_by ?? '',
  };
  if (options.includeImages) {
    // ImageShop/ImageProduct/ImageActivity เดิมเก็บ base64 หรือ URL — หลัง migrate
    // เป็น R2 จะคืนเป็น URL ที่ frontend แสดงได้ทันที
    const base = options.imageBaseUrl ?? '';
    const toUrl = (ref: string): string => {
      if (!ref) return '';
      if (/^(https?:|data:)/.test(ref)) return ref;
      return base + '/images/' + ref;
    };
    record.ImageShop = toUrl(row.image_shop_ref);
    record.ImageProduct = toUrl(row.image_product_ref);
    record.ImageActivity = toUrl(row.image_activity_ref);
  }
  if (options.rowIndex !== undefined) {
    record._rowIndex = options.rowIndex;
  }
  return record;
}

/** แถว scalable (Shops/Products/ShopGallery) — mapRowToObject_ เดิมแปลง Date → ISO
 *  ดังนั้นคืนค่าตรง ๆ จาก D1 (TEXT ISO) ได้เลย */
export function shopRowToApi(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ShopID: row.shop_id ?? '',
    LegacyBackendId: row.legacy_backend_id ?? '',
    LegacyLamproundID: row.legacy_lampround_id ?? '',
    BusinessName: row.business_name ?? '',
    OwnerName: row.owner_name ?? '',
    Phone: row.phone ?? '',
    LineID: row.line_id ?? '',
    Facebook: row.facebook ?? '',
    Website: row.website ?? '',
    LocationText: row.location_text ?? '',
    Latitude: row.latitude ?? '',
    Longitude: row.longitude ?? '',
    BusinessType: row.business_type ?? '',
    ProductCategory: row.product_category ?? '[]',
    BusinessLevel: row.business_level ?? '',
    MainProducts: row.main_products ?? '',
    ProductionCapacity: row.production_capacity ?? '',
    SalesChannel: row.sales_channel ?? '[]',
    AvgPrice: row.avg_price ?? '',
    BusinessStatus: row.business_status ?? '',
    PotentialLevel: row.potential_level ?? '',
    Issues: row.issues ?? '',
    SupportNeeded: row.support_needed ?? '',
    Note: row.note ?? '',
    ShopHistory: row.shop_history ?? '',
    CreatedAt: row.created_at ?? '',
    CreatedBy: row.created_by ?? '',
    UpdatedAt: row.updated_at ?? '',
    UpdatedBy: row.updated_by ?? '',
    IsDeleted: row.is_deleted ?? 'FALSE',
    DeletedAt: row.deleted_at ?? '',
    DeletedBy: row.deleted_by ?? '',
  };
}

export function productRowToApi(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ProductID: row.product_id ?? '',
    ShopID: row.shop_id ?? '',
    ProductName: row.product_name ?? '',
    ProductCategory: row.product_category ?? '',
    Description: row.description ?? '',
    Price: row.price ?? '',
    Unit: row.unit ?? '',
    SortOrder: row.sort_order ?? 0,
    IsDeleted: row.is_deleted ?? 'FALSE',
    CreatedAt: row.created_at ?? '',
    CreatedBy: row.created_by ?? '',
    UpdatedAt: row.updated_at ?? '',
    UpdatedBy: row.updated_by ?? '',
  };
}

export function galleryRowToApi(
  row: Record<string, unknown>,
  imageBaseUrl = ''
): Record<string, unknown> {
  // รูปที่ migrate ขึ้น R2 แล้ว: r2_key มาจาก JOIN r2_objects (source_ref = DriveFileId)
  // ไม่งั้นใช้ URL เดิมตามชีต (Drive lh3) — ต้นฉบับ Drive ยังอยู่ครบ
  const r2Key = String(row.r2_key ?? '');
  const driveUrl = r2Key
    ? `${imageBaseUrl}/images/${r2Key}`
    : String(row.drive_url ?? '');
  const thumbnailUrl = r2Key ? driveUrl : String(row.thumbnail_url ?? '');
  const resolve = (url: string): string => {
    if (!url) return url;
    if (/^(https?:|data:)/.test(url)) return url;
    return imageBaseUrl + '/images/' + url;
  };
  return {
    GalleryID: row.gallery_id ?? '',
    ShopID: row.shop_id ?? '',
    ProductID: row.product_id ?? '',
    ImageRole: row.image_role ?? 'gallery',
    DisplayName: row.display_name ?? '',
    DriveFileId: row.drive_file_id ?? '',
    DriveUrl: resolve(driveUrl),
    ThumbnailUrl: resolve(thumbnailUrl),
    MimeType: row.mime_type ?? 'image/jpeg',
    FileSize: row.file_size ?? '',
    Width: row.width ?? '',
    Height: row.height ?? '',
    SortOrder: row.sort_order ?? 0,
    Status: row.status ?? 'ACTIVE',
    CreatedAt: row.created_at ?? '',
    CreatedBy: row.created_by ?? '',
    UpdatedAt: row.updated_at ?? '',
    UpdatedBy: row.updated_by ?? '',
  };
}

/** คัดลอกตรงจาก fieldMap ของ updateRecord (บรรทัด 775–789):
 *  Sheet header ↔ snake_case payload key */
export const UPDATE_FIELD_MAP: Record<string, string> = {
  BusinessName: 'business_name',
  OwnerName: 'owner_name',
  Phone: 'phone',
  LineID: 'line_id',
  Facebook: 'facebook',
  Website: 'website',
  LocationText: 'location_text',
  Latitude: 'latitude',
  Longitude: 'longitude',
  BusinessType: 'business_type',
  ProductCategory: 'product_category',
  BusinessLevel: 'business_level',
  MainProducts: 'main_products',
  ProductionCapacity: 'production_capacity',
  SalesChannel: 'sales_channel',
  AvgPrice: 'avg_price',
  BusinessStatus: 'business_status',
  PotentialLevel: 'potential_level',
  Issues: 'issues',
  SupportNeeded: 'support_needed',
  ImageShop: 'image_shop',
  ImageProduct: 'image_product',
  ImageActivity: 'image_activity',
  Note: 'note',
  ShopHistory: 'shop_history',
};

export const UPDATE_SKIP_FIELDS = [
  'BackendId',
  'LamproundID',
  'CreatedAt',
  'CreatedBy',
  'IsDeleted',
  'DeletedAt',
  'DeletedBy',
];
