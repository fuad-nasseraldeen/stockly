/**
 * Price Table Component
 * 
 * Reusable price table that uses the column registry system.
 */

import * as React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { ColumnDefinition, PriceData, ProductData } from '../../lib/price-columns';
import { Settings } from '../../lib/column-resolver';

type PriceTableProps = {
  prices: PriceData[];
  product: ProductData | null;
  settings: Settings;
  columns: ColumnDefinition[];
  renderActions?: (price: PriceData, index: number) => React.ReactNode;
};

export function PriceTable({
  prices,
  product,
  settings,
  columns,
  renderActions,
}: PriceTableProps) {
  return (
    <Table className="min-w-full">
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.id}
              className={`whitespace-nowrap ${col.minWidth ? `min-w-[${col.minWidth}px]` : ''} ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}
            >
              {col.renderHeader()}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {prices.map((price, idx) => (
          <TableRow key={`${price.supplier_id}-${idx}`}>
            {columns.map((col) => {
              if (col.id === 'actions' && renderActions) {
                return (
                  <TableCell key={col.id} className="whitespace-nowrap">
                    {renderActions(price, idx)}
                  </TableCell>
                );
              }
              return (
                <TableCell
                  key={col.id}
                  className={`whitespace-nowrap ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}
                >
                  {col.renderCell(price, product, settings)}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
