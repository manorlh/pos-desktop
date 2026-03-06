# Product and Category Models Specification

This document specifies the data models for **Product** and **Category** entities in the POS system.

---

## Table of Contents

1. [Product Model](#product-model)
2. [Category Model](#category-model)
3. [Relationships](#relationships)
4. [Validation Rules](#validation-rules)
5. [Business Rules](#business-rules)
6. [API Endpoints](#api-endpoints)

---

## Product Model

### Overview
The Product model represents items that can be sold in the POS system. Each product must belong to a category and has inventory tracking capabilities.

### Fields

| Field | Type | Required | Unique | Description |
|-------|------|----------|--------|-------------|
| `id` | `string` (UUID) | Yes | Yes | Primary key. Unique identifier for the product. |
| `name` | `string` | Yes | No | Product name. Must be non-empty after trimming. |
| `description` | `string` | No | No | Optional product description. Can be null/empty. |
| `price` | `number` (decimal) | Yes | No | Product price. Must be >= 0. Stored as REAL/FLOAT in database. |
| `sku` | `string` | Yes | Yes | Stock Keeping Unit. Unique identifier for inventory tracking. Must be non-empty after trimming. |
| `categoryId` | `string` (UUID) | Yes | No | Foreign key to Category. Must reference an existing category. |
| `imageUrl` | `string` (URL) | No | No | Optional URL to product image. Can be null/empty. |
| `inStock` | `boolean` | Yes | No | Availability flag. Default: `true`. Indicates if product is available for sale. |
| `stockQuantity` | `integer` | Yes | No | Current stock quantity. Must be >= 0. Default: `0`. |
| `barcode` | `string` | No | No | Optional barcode (EAN/UPC). Can be null/empty. |
| `taxRate` | `number` (decimal) | No | No | Optional tax rate percentage. Can be null. If provided, must be >= 0. |
| `createdAt` | `datetime` (ISO 8601) | Yes | No | Timestamp when product was created. Auto-generated on creation. |
| `updatedAt` | `datetime` (ISO 8601) | Yes | No | Timestamp when product was last updated. Auto-updated on modification. |

### Database Schema

```sql
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  categoryId TEXT NOT NULL,
  imageUrl TEXT,
  inStock INTEGER NOT NULL DEFAULT 1,  -- 0 = false, 1 = true
  stockQuantity INTEGER NOT NULL DEFAULT 0,
  barcode TEXT,
  taxRate REAL,
  createdAt TEXT NOT NULL,  -- ISO 8601 string
  updatedAt TEXT NOT NULL,  -- ISO 8601 string
  FOREIGN KEY (categoryId) REFERENCES categories(id)
);

CREATE INDEX idx_products_categoryId ON products(categoryId);
CREATE INDEX idx_products_sku ON products(sku);
```

### JSON Example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Premium Coffee Beans",
  "description": "Arabica coffee beans, 500g package",
  "price": 29.99,
  "sku": "COFFEE-500-001",
  "categoryId": "660e8400-e29b-41d4-a716-446655440000",
  "imageUrl": "https://example.com/images/coffee-beans.jpg",
  "inStock": true,
  "stockQuantity": 150,
  "barcode": "1234567890123",
  "taxRate": 17.0,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-20T14:45:00.000Z"
}
```

---

## Category Model

### Overview
The Category model represents product categories. Categories support hierarchical structure (parent-child relationships) for organizing products.

### Fields

| Field | Type | Required | Unique | Description |
|-------|------|----------|--------|-------------|
| `id` | `string` (UUID) | Yes | Yes | Primary key. Unique identifier for the category. |
| `name` | `string` | Yes | No | Category name. Must be non-empty after trimming. |
| `description` | `string` | No | No | Optional category description. Can be null/empty. |
| `color` | `string` (hex) | No | No | Optional hex color code for UI display. Format: `#RRGGBB` or `#RGB`. Must match regex: `^#([A-Fa-f0-9]{6}\|[A-Fa-f0-9]{3})$` |
| `imageUrl` | `string` (URL) | No | No | Optional URL to category image/icon. Can be null/empty. |
| `parentId` | `string` (UUID) | No | No | Foreign key to parent Category. Null for top-level categories. Must reference an existing category if provided. Cannot reference itself. |
| `isActive` | `boolean` | Yes | No | Active status flag. Default: `true`. Inactive categories should not be selectable for new products. |
| `sortOrder` | `integer` | Yes | No | Display order for sorting categories. Default: `0`. Lower numbers appear first. |
| `createdAt` | `datetime` (ISO 8601) | Yes | No | Timestamp when category was created. Auto-generated on creation. |
| `updatedAt` | `datetime` (ISO 8601) | Yes | No | Timestamp when category was last updated. Auto-updated on modification. |

### Database Schema

```sql
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,  -- Hex color code
  imageUrl TEXT,
  parentId TEXT,  -- Self-referencing foreign key
  isActive INTEGER NOT NULL DEFAULT 1,  -- 0 = false, 1 = true
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,  -- ISO 8601 string
  updatedAt TEXT NOT NULL,  -- ISO 8601 string
  FOREIGN KEY (parentId) REFERENCES categories(id)
);

CREATE INDEX idx_categories_parentId ON categories(parentId);
```

### JSON Example

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "name": "Beverages",
  "description": "Hot and cold beverages",
  "color": "#3B82F6",
  "imageUrl": "https://example.com/images/beverages-icon.png",
  "parentId": null,
  "isActive": true,
  "sortOrder": 1,
  "createdAt": "2024-01-10T08:00:00.000Z",
  "updatedAt": "2024-01-15T12:30:00.000Z"
}
```

### Hierarchical Category Example

```json
// Parent category
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "name": "Beverages",
  "parentId": null,
  "isActive": true,
  "sortOrder": 1
}

// Child category
{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "name": "Coffee",
  "parentId": "660e8400-e29b-41d4-a716-446655440000",
  "isActive": true,
  "sortOrder": 1
}
```

---

## Relationships

### Product → Category
- **Type**: Many-to-One
- **Foreign Key**: `Product.categoryId` → `Category.id`
- **Constraint**: A product must belong to exactly one category
- **Cascade Behavior**: 
  - **On Delete**: Should prevent deletion of a category if it has products (or cascade delete products)
  - **On Update**: Should update product references if category ID changes

### Category → Category (Self-Referencing)
- **Type**: One-to-Many (Parent-Child)
- **Foreign Key**: `Category.parentId` → `Category.id`
- **Constraint**: A category can have zero or one parent (null for top-level)
- **Cascade Behavior**:
  - **On Delete**: Should prevent deletion if category has child categories (or cascade delete children)
  - **Circular Reference**: Must prevent a category from being its own parent or ancestor

---

## Validation Rules

### Product Validation

1. **Required Fields**:
   - `name`: Must be non-empty string after trimming whitespace
   - `price`: Must be a valid number >= 0
   - `sku`: Must be non-empty string after trimming whitespace
   - `categoryId`: Must be a valid UUID that exists in categories table

2. **Unique Constraints**:
   - `id`: Must be unique across all products
   - `sku`: Must be unique across all products

3. **Type Validation**:
   - `price`: Must be a number (integer or decimal) >= 0
   - `stockQuantity`: Must be an integer >= 0
   - `taxRate`: If provided, must be a number >= 0
   - `inStock`: Must be a boolean value
   - `imageUrl`: If provided, should be a valid URL format
   - `barcode`: If provided, should be a valid barcode format

4. **Business Rules**:
   - If `stockQuantity` is 0, `inStock` should typically be `false` (but not enforced at model level)
   - `categoryId` must reference an active category (recommended, not enforced at DB level)

### Category Validation

1. **Required Fields**:
   - `name`: Must be non-empty string after trimming whitespace

2. **Unique Constraints**:
   - `id`: Must be unique across all categories

3. **Type Validation**:
   - `color`: If provided, must match hex color format: `^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$`
   - `sortOrder`: Must be an integer (can be negative)
   - `isActive`: Must be a boolean value
   - `imageUrl`: If provided, should be a valid URL format
   - `parentId`: If provided, must be a valid UUID that exists in categories table

4. **Business Rules**:
   - `parentId` cannot reference the same category (self-reference prevention)
   - `parentId` cannot create circular references (category A → category B → category A)
   - When deleting a category, check if it has child categories or products
   - Only active categories should be available for selection when creating products

---

## Business Rules

### Product Rules

1. **Stock Management**:
   - When a product is sold, `stockQuantity` should be decremented
   - If `stockQuantity` reaches 0, consider setting `inStock` to `false`
   - Products with `inStock = false` should not appear in POS product selection (unless explicitly allowed)

2. **Category Dependency**:
   - Products cannot be created without a valid category
   - If a category is deleted, all associated products must be handled (either deleted or reassigned)

3. **SKU Management**:
   - SKU should be immutable (not changeable after creation) to maintain inventory integrity
   - SKU format is application-specific (no standard format enforced)

### Category Rules

1. **Hierarchy Management**:
   - Maximum depth of category hierarchy should be limited (recommended: 3-4 levels)
   - When displaying categories, show hierarchy (e.g., "Beverages > Coffee > Espresso")
   - Top-level categories have `parentId = null`

2. **Active Status**:
   - Inactive categories (`isActive = false`) should not be selectable for new products
   - Existing products with inactive categories should still function normally
   - When deactivating a category, consider deactivating child categories

3. **Sorting**:
   - Categories should be sorted by `sortOrder` (ascending), then by `name` (alphabetical)
   - When creating a new category, default `sortOrder` to the highest existing value + 1

---

## API Endpoints

### Product Endpoints

#### Create Product
```
POST /api/products
Content-Type: application/json

Request Body:
{
  "name": "Product Name",
  "description": "Optional description",
  "price": 29.99,
  "sku": "SKU-001",
  "categoryId": "category-uuid",
  "imageUrl": "https://...",
  "inStock": true,
  "stockQuantity": 100,
  "barcode": "1234567890123",
  "taxRate": 17.0
}

Response: 201 Created
{
  "id": "product-uuid",
  ... (all fields with timestamps)
}
```

#### Get Product
```
GET /api/products/{id}

Response: 200 OK
{
  "id": "product-uuid",
  ... (all fields)
}
```

#### Update Product
```
PUT /api/products/{id}
Content-Type: application/json

Request Body: (same as create, all fields)

Response: 200 OK
{
  "id": "product-uuid",
  ... (updated fields)
}
```

#### Delete Product
```
DELETE /api/products/{id}

Response: 204 No Content
```

#### List Products
```
GET /api/products?categoryId={uuid}&inStock={boolean}&page={number}&limit={number}

Response: 200 OK
{
  "products": [...],
  "total": 100,
  "page": 1,
  "limit": 50
}
```

### Category Endpoints

#### Create Category
```
POST /api/categories
Content-Type: application/json

Request Body:
{
  "name": "Category Name",
  "description": "Optional description",
  "color": "#3B82F6",
  "imageUrl": "https://...",
  "parentId": "parent-category-uuid" | null,
  "isActive": true,
  "sortOrder": 1
}

Response: 201 Created
{
  "id": "category-uuid",
  ... (all fields with timestamps)
}
```

#### Get Category
```
GET /api/categories/{id}

Response: 200 OK
{
  "id": "category-uuid",
  ... (all fields)
}
```

#### Update Category
```
PUT /api/categories/{id}
Content-Type: application/json

Request Body: (same as create, all fields)

Response: 200 OK
{
  "id": "category-uuid",
  ... (updated fields)
}
```

#### Delete Category
```
DELETE /api/categories/{id}

Response: 204 No Content (or 400 if category has products/children)
```

#### List Categories
```
GET /api/categories?parentId={uuid}&isActive={boolean}&includeChildren={boolean}

Response: 200 OK
[
  {
    "id": "category-uuid",
    ...,
    "children": [...] // if includeChildren=true
  }
]
```

---

## Error Responses

All endpoints should return standard HTTP status codes:

- `200 OK`: Successful GET/PUT request
- `201 Created`: Successful POST request
- `204 No Content`: Successful DELETE request
- `400 Bad Request`: Validation error
- `404 Not Found`: Resource not found
- `409 Conflict`: Unique constraint violation (e.g., duplicate SKU)
- `422 Unprocessable Entity`: Business rule violation (e.g., deleting category with products)

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Product name is required",
    "fields": {
      "name": "Product name is required",
      "price": "Price must be a positive number"
    }
  }
}
```

---

## Notes for Implementation

1. **UUID Generation**: Use UUID v4 for all `id` fields
2. **Timestamps**: Store as ISO 8601 strings in database, convert to Date objects in application
3. **Boolean Storage**: In SQLite, store booleans as INTEGER (0/1). In other databases, use native BOOLEAN type
4. **Decimal Precision**: Use appropriate decimal types for `price` and `taxRate` (e.g., DECIMAL(10,2) in SQL)
5. **Indexes**: Create indexes on foreign keys and frequently queried fields (sku, categoryId, parentId)
6. **Soft Deletes**: Consider implementing soft deletes (isDeleted flag) instead of hard deletes for audit purposes
7. **Audit Trail**: Consider adding `createdBy` and `updatedBy` fields if multi-user support is needed

---

## Version History

- **v1.0** (2024-01-20): Initial specification
