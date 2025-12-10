/**
 * E-Paper Hardware Adapters
 *
 * Adapters provide a hardware abstraction layer between display drivers
 * and the actual GPIO/SPI hardware (or mock implementations).
 */

export { LgpioAdapter } from "./LgpioAdapter";
export { MockAdapter } from "./MockAdapter";
