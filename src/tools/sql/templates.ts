export const QUERY_TEMPLATES: Record<string, string> = {
  orders_by_customer: `
    SELECT o.id, o.order_date, o.total_amount
    FROM orders o
    WHERE o.customer_id = :customer_id
    ORDER BY o.order_date DESC
    LIMIT :limit
  `,
  sales_between_dates: `
    SELECT date(o.order_date) AS day, SUM(o.total_amount) AS sales
    FROM orders o
    WHERE date(o.order_date) BETWEEN date(:start_date) AND date(:end_date)
    GROUP BY day
    ORDER BY day ASC
    LIMIT :limit
  `
};
