import { Suspense } from "react";
import { SelectAccountStep } from "@/components/onboarding/SelectAccountStep";

export default function SelectAccountPage() {
  return (
    <Suspense>
      <SelectAccountStep />
    </Suspense>
  );
}
