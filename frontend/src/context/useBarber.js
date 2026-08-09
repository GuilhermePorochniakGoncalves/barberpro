import { useContext } from "react";
import { BarberContext } from "./barber-context";

export function useBarber() {
  return useContext(BarberContext);
}
