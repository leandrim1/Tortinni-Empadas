import { relations } from 'drizzle-orm';
import { users, userAddresses } from './auth';
import {
  categories,
  products,
  productImages,
  productVariants,
  combos,
  comboGroups,
  comboOptions,
} from './catalog';
import { deliveryRegions } from './store';
import {
  orders,
  orderItems,
  orderItemOptions,
  orderStatusHistory,
  paymentTransactions,
} from './orders';

export const usersRelations = relations(users, ({ many }) => ({
  addresses: many(userAddresses),
  orders: many(orders),
}));

export const userAddressesRelations = relations(userAddresses, ({ one }) => ({
  user: one(users, { fields: [userAddresses.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages),
  variants: many(productVariants),
  combo: one(combos, { fields: [products.id], references: [combos.productId] }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const combosRelations = relations(combos, ({ one, many }) => ({
  product: one(products, { fields: [combos.productId], references: [products.id] }),
  groups: many(comboGroups),
}));

export const comboGroupsRelations = relations(comboGroups, ({ one, many }) => ({
  combo: one(combos, { fields: [comboGroups.comboId], references: [combos.id] }),
  options: many(comboOptions),
}));

export const comboOptionsRelations = relations(comboOptions, ({ one }) => ({
  group: one(comboGroups, { fields: [comboOptions.groupId], references: [comboGroups.id] }),
  product: one(products, { fields: [comboOptions.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  region: one(deliveryRegions, {
    fields: [orders.deliveryRegionId],
    references: [deliveryRegions.id],
  }),
  items: many(orderItems),
  statusHistory: many(orderStatusHistory),
  payments: many(paymentTransactions),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  options: many(orderItemOptions),
}));

export const orderItemOptionsRelations = relations(orderItemOptions, ({ one }) => ({
  item: one(orderItems, { fields: [orderItemOptions.orderItemId], references: [orderItems.id] }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, { fields: [orderStatusHistory.orderId], references: [orders.id] }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  order: one(orders, { fields: [paymentTransactions.orderId], references: [orders.id] }),
}));
