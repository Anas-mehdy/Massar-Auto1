ALTER TABLE public."Customer"
  ADD CONSTRAINT "Customer_shop_id_key" UNIQUE ("shopId", "id");

ALTER TABLE public."Vehicle"
  ADD CONSTRAINT "Vehicle_customer_shop_fkey"
  FOREIGN KEY ("shopId", "customerId")
  REFERENCES public."Customer" ("shopId", "id")
  ON DELETE RESTRICT;

ALTER TABLE public."Vehicle"
  ADD CONSTRAINT "Vehicle_shop_id_customer_key" UNIQUE ("shopId", "id", "customerId");

ALTER TABLE public."ServiceOrder"
  ADD CONSTRAINT "ServiceOrder_vehicle_customer_shop_fkey"
  FOREIGN KEY ("shopId", "vehicleId", "customerId")
  REFERENCES public."Vehicle" ("shopId", "id", "customerId")
  ON DELETE RESTRICT;
