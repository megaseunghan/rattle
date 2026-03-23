import { supabase } from '../supabase';
import { Order, OrderItem, Ingredient } from '../../types';

export type OrderWithItems = Order & {
  order_items: (OrderItem & { ingredient: Ingredient | null })[];
};

export async function getOrders(storeId: string): Promise<OrderWithItems[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, ingredient:ingredients(*))')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as OrderWithItems[];
}

export async function getOrderById(id: string): Promise<OrderWithItems> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, ingredient:ingredients(*))')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as OrderWithItems;
}

export async function createOrderWithItems(
  storeId: string,
  supplierName: string,
  orderDate: string,
  items: { ingredient_id: string; quantity: number; unit: string; unit_price: number }[]
): Promise<string> {
  const { data, error } = await supabase.rpc('create_order_with_items', {
    p_store_id: storeId,
    p_supplier_name: supplierName,
    p_order_date: orderDate,
    p_items: items,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateOrderStatus(
  id: string,
  status: Order['status']
): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Order;
}

export async function deliverOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('deliver_order', {
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message);
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
