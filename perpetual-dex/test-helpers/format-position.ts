import { Position, PositionType } from "./models";

export function formatPosition(
  amount: bigint,
  position: PositionType,
  leverage: bigint
): Position {
  return {
    amount,
    position,
    leverage,
  };
}
