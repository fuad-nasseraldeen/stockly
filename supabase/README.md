# Supabase Migrations

יש להריץ מיגרציות לפי סדר מספרי.

## רשימת מיגרציות קיימות

נכון לעכשיו קיימות מיגרציות עד `0028`.

מיגרציות חדשות רלוונטיות לייבוא ומטא-דאטה מחירים:

- `0022_add_id_to_current_price_view.sql`
- `0023_change_cost_price_precision.sql`
- `0024_add_import_mappings.sql`
- `0025_add_import_mappings_source_type.sql`
- `0026_add_safe_package_metadata_to_price_entries.sql`
- `0027_add_roll_to_package_type_enum.sql`
- `0028_refresh_current_price_view_with_package_metadata.sql`

## חובה לפני הרצה

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

## סדר עבודה מומלץ

1. להריץ את כל המיגרציות לפי מספר.
2. לוודא שה-view `product_supplier_current_price` כולל מטא-דאטה מורחב (0028).
3. לוודא שהטבלה `price_entries` כוללת עמודות metadata החדשות (0026).

## בדיקות מהירות אחרי מיגרציה

```sql
-- עמודות חדשות ב-price_entries
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'price_entries'
  AND column_name IN ('package_type', 'source_price_includes_vat', 'vat_rate', 'effective_from');

-- בדיקת ערך enum חדש
SELECT unnest(enum_range(NULL::package_type_enum));
```

## הערת תאימות לאחור

ב-backend קיימת לוגיקת fallback במקרים בהם חלק מעמודות metadata עדיין לא קיימות בדאטהבייס,
כדי למנוע שבירה בזמן deploy הדרגתי.
