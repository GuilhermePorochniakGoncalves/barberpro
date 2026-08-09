import { useContext } from "react";
import { BarbeirosContext } from "./barbeiros-context";

export function useBarbeiros() {
  return useContext(BarbeirosContext);
}
