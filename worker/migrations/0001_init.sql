-- ============================================================
-- Lampang Pround — D1 Schema 0001_init
-- คอลัมน์ทั้งหมดคง semantic ตาม Sheet headers เดิม (Code.gs DATA_HEADERS
-- และ SCALABLE_SHEETS) — ห้าม rename โดยไม่จำเป็น
-- ข้อยกเว้นเดียว: ImageShop/ImageProduct/ImageActivity (base64 ในเซลล์)
--   → *_ref เก็บ R2 object key หรือ URL เดิม ตามกติกา "ห้ามเก็บ binary ใน D1"
-- ค่า soft delete คงรูปแบบเดิม: IsDeleted = 'TRUE'/'FALSE' (TEXT)
--   ShopGallery.Status = 'ACTIVE'/'DELETED'
-- ============================================================

-- ตัวนับ ID แบบ atomic แทนการ scan max+1 ของ GAS
CREATE TABLE id_counters (
  name       TEXT PRIMARY KEY,  -- 'SHOP' | 'PROD' | 'GAL'
  next_value INTEGER NOT NULL DEFAULT 1
);
INSERT INTO id_counters (name, next_value) VALUES ('SHOP', 1), ('PROD', 1), ('GAL', 1);

-- ------------------------------------------------------------
-- LamproundData (legacy flat table, 32 headers)
-- BackendId, LamproundID, BusinessName, OwnerName, Phone, LineID, Facebook,
-- Website, LocationText, Latitude, Longitude, BusinessType, ProductCategory,
-- BusinessLevel, MainProducts, ProductionCapacity, SalesChannel, AvgPrice,
-- BusinessStatus, PotentialLevel, Issues, SupportNeeded, ImageShop,
-- ImageProduct, ImageActivity, Note, CreatedAt, CreatedBy, IsDeleted,
-- DeletedAt, DeletedBy, ShopHistory
-- ------------------------------------------------------------
CREATE TABLE legacy_records (
  backend_id          TEXT PRIMARY KEY,            -- BackendId (UUID)
  lampround_id        TEXT,                        -- LamproundID (LR-YYMMDD-XXXX)
  business_name       TEXT NOT NULL DEFAULT '',
  owner_name          TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',
  line_id             TEXT NOT NULL DEFAULT '',
  facebook            TEXT NOT NULL DEFAULT '',
  website             TEXT NOT NULL DEFAULT '',
  location_text       TEXT NOT NULL DEFAULT '',
  latitude            TEXT NOT NULL DEFAULT '',
  longitude           TEXT NOT NULL DEFAULT '',
  business_type       TEXT NOT NULL DEFAULT '',
  product_category    TEXT NOT NULL DEFAULT '[]',  -- JSON array string (parity กับชีต)
  business_level      TEXT NOT NULL DEFAULT '',
  main_products       TEXT NOT NULL DEFAULT '',
  production_capacity TEXT NOT NULL DEFAULT '',
  sales_channel       TEXT NOT NULL DEFAULT '[]',  -- JSON array string
  avg_price           TEXT NOT NULL DEFAULT '',
  business_status     TEXT NOT NULL DEFAULT '',
  potential_level     TEXT NOT NULL DEFAULT '',
  issues              TEXT NOT NULL DEFAULT '',
  support_needed      TEXT NOT NULL DEFAULT '',
  image_shop_ref      TEXT NOT NULL DEFAULT '',    -- R2 key หรือ URL เดิม (แทน ImageShop)
  image_product_ref   TEXT NOT NULL DEFAULT '',    -- แทน ImageProduct
  image_activity_ref  TEXT NOT NULL DEFAULT '',    -- แทน ImageActivity
  note                TEXT NOT NULL DEFAULT '',
  shop_history        TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by          TEXT NOT NULL DEFAULT 'Guest',
  is_deleted          TEXT NOT NULL DEFAULT 'FALSE',
  deleted_at          TEXT,
  deleted_by          TEXT
);
CREATE UNIQUE INDEX idx_legacy_lampround_id ON legacy_records(lampround_id) WHERE lampround_id IS NOT NULL AND lampround_id != '';
CREATE INDEX idx_legacy_is_deleted ON legacy_records(is_deleted);
CREATE INDEX idx_legacy_created_by ON legacy_records(created_by);
CREATE INDEX idx_legacy_business_name ON legacy_records(business_name);

-- ------------------------------------------------------------
-- Users: Username, Password, Name, Role, Email (+ SessionToken, LastLoginAt)
-- Password เดิม plaintext → เก็บเป็น PBKDF2 hash ตั้งแต่ migration
-- รูปแบบ: pbkdf2$<iterations>$<salt_b64>$<hash_b64>
-- ------------------------------------------------------------
CREATE TABLE users (
  username      TEXT PRIMARY KEY,          -- lowercase (parity กับการเทียบของ GAS)
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  email         TEXT NOT NULL DEFAULT '',
  session_token TEXT,                      -- single-session เฉพาะ role 'user'
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email != '';

-- CacheService 'sess_<uuid>' → ตาราง sessions (TTL 6 ชม. เหมือนเดิม)
CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  created_at INTEGER NOT NULL,             -- epoch ms
  expires_at INTEGER NOT NULL              -- epoch ms
);
CREATE INDEX idx_sessions_username ON sessions(username);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- CacheService 'guest_access_<backendId>' → ตาราง guest_access_keys (TTL 6 ชม.)
CREATE TABLE guest_access_keys (
  backend_id TEXT PRIMARY KEY,
  access_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- ------------------------------------------------------------
-- Shops (32 headers): ShopID, LegacyBackendId, LegacyLamproundID, BusinessName,
-- OwnerName, Phone, LineID, Facebook, Website, LocationText, Latitude,
-- Longitude, BusinessType, ProductCategory, BusinessLevel, MainProducts,
-- ProductionCapacity, SalesChannel, AvgPrice, BusinessStatus, PotentialLevel,
-- Issues, SupportNeeded, Note, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy,
-- IsDeleted, DeletedAt, DeletedBy, ShopHistory
-- ------------------------------------------------------------
CREATE TABLE shops (
  shop_id             TEXT PRIMARY KEY,   -- SHOP-XXXXXX
  legacy_backend_id   TEXT NOT NULL DEFAULT '',
  legacy_lampround_id TEXT NOT NULL DEFAULT '',
  business_name       TEXT NOT NULL DEFAULT '',
  owner_name          TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',
  line_id             TEXT NOT NULL DEFAULT '',
  facebook            TEXT NOT NULL DEFAULT '',
  website             TEXT NOT NULL DEFAULT '',
  location_text       TEXT NOT NULL DEFAULT '',
  latitude            TEXT NOT NULL DEFAULT '',
  longitude           TEXT NOT NULL DEFAULT '',
  business_type       TEXT NOT NULL DEFAULT '',
  product_category    TEXT NOT NULL DEFAULT '[]',
  business_level      TEXT NOT NULL DEFAULT '',
  main_products       TEXT NOT NULL DEFAULT '',
  production_capacity TEXT NOT NULL DEFAULT '',
  sales_channel       TEXT NOT NULL DEFAULT '[]',
  avg_price           TEXT NOT NULL DEFAULT '',
  business_status     TEXT NOT NULL DEFAULT '',
  potential_level     TEXT NOT NULL DEFAULT '',
  issues              TEXT NOT NULL DEFAULT '',
  support_needed      TEXT NOT NULL DEFAULT '',
  note                TEXT NOT NULL DEFAULT '',
  shop_history        TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by          TEXT NOT NULL DEFAULT 'Guest',
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by          TEXT NOT NULL DEFAULT 'Guest',
  is_deleted          TEXT NOT NULL DEFAULT 'FALSE',
  deleted_at          TEXT,
  deleted_by          TEXT
);
CREATE INDEX idx_shops_legacy_backend   ON shops(legacy_backend_id);
CREATE INDEX idx_shops_legacy_lampround ON shops(legacy_lampround_id);
CREATE INDEX idx_shops_business_name    ON shops(business_name);

-- ------------------------------------------------------------
-- Products (13 headers): ProductID, ShopID, ProductName, ProductCategory,
-- Description, Price, Unit, SortOrder, IsDeleted, CreatedAt, CreatedBy,
-- UpdatedAt, UpdatedBy
-- หมายเหตุ: GAS เขียน ProductID ใหม่ทุกครั้งที่ replace (id ไม่เสถียร) —
-- D1 ใช้ transaction เดียวทั้ง replace เพื่อไม่มี partial write
-- ------------------------------------------------------------
CREATE TABLE products (
  product_id       TEXT PRIMARY KEY,      -- PROD-XXXXXX
  shop_id          TEXT NOT NULL,
  product_name     TEXT NOT NULL DEFAULT '',
  product_category TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  price            TEXT NOT NULL DEFAULT '',
  unit             TEXT NOT NULL DEFAULT '',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_deleted       TEXT NOT NULL DEFAULT 'FALSE',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by       TEXT NOT NULL DEFAULT 'Guest',
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by       TEXT NOT NULL DEFAULT 'Guest'
);
CREATE INDEX idx_products_shop       ON products(shop_id);
CREATE INDEX idx_products_sort_order ON products(shop_id, sort_order);

-- ------------------------------------------------------------
-- ShopGallery (18 headers): GalleryID, ShopID, ProductID, ImageRole,
-- DisplayName, DriveFileId, DriveUrl, ThumbnailUrl, MimeType, FileSize,
-- Width, Height, SortOrder, Status, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
-- DriveFileId คงไว้เพื่อ trace กลับ Google Drive ต้นฉบับ (ห้ามลบต้นฉบับ)
-- object_key ของ R2 แนบผ่านตาราง r2_objects (source_ref = DriveFileId)
-- ------------------------------------------------------------
CREATE TABLE shop_gallery (
  gallery_id   TEXT PRIMARY KEY,          -- GAL-XXXXXX
  shop_id      TEXT NOT NULL,             -- อาจเป็น legacy BackendId หรือ SHOP-XXXXXX (parity)
  product_id   TEXT NOT NULL DEFAULT '',
  image_role   TEXT NOT NULL DEFAULT 'gallery',  -- 'shop' | 'product' | 'activity' | 'gallery'
  display_name TEXT NOT NULL DEFAULT '',
  drive_file_id TEXT NOT NULL DEFAULT '',
  drive_url    TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  mime_type    TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size    INTEGER NOT NULL DEFAULT 0,
  width        TEXT NOT NULL DEFAULT '',  -- GAS เขียน '' เสมอ — คง parity
  height       TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by   TEXT NOT NULL DEFAULT 'Guest',
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by   TEXT NOT NULL DEFAULT 'Guest'
);
CREATE INDEX idx_gallery_shop       ON shop_gallery(shop_id);
CREATE INDEX idx_gallery_product_id ON shop_gallery(product_id);
CREATE INDEX idx_gallery_status     ON shop_gallery(shop_id, status);

-- ทะเบียนไฟล์ R2: ใช้ทำ idempotency/resume ของ migration และตรวจ missing image
CREATE TABLE r2_objects (
  object_key  TEXT PRIMARY KEY,          -- เช่น shops/SHOP-000123/GAL-000456.jpg
  source      TEXT NOT NULL,             -- 'legacy_base64' | 'drive' | 'upload'
  source_ref  TEXT NOT NULL DEFAULT '',  -- DriveFileId หรือชื่อคอลัมน์ legacy
  shop_id     TEXT NOT NULL DEFAULT '',
  mime_type   TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_r2_objects_source ON r2_objects(source, source_ref);
