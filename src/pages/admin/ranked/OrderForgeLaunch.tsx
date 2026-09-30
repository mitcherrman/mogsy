/** OF1 — owner playtest launcher for the admin-only `admin.order_forge` preset. */
import { PresetLaunch } from "./PresetLaunch";

export const ORDER_FORGE_PRESET = "admin.order_forge";

export function OrderForgeLaunch() {
  return (
    <PresetLaunch
      preset={ORDER_FORGE_PRESET}
      testId="order-forge-launch"
      buttonLabel="Play Order Forge"
      failureMessage="Order Forge could not be started. Try again shortly."
    >
      Arrange 5 items from cheapest to most expensive in an unrated Ranked Bot playtest.
    </PresetLaunch>
  );
}

export default OrderForgeLaunch;
