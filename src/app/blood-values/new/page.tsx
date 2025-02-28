import { Suspense } from 'react';
import BloodValuesForm from './BloodValuesForm.client';


export default function BloodValuesPage() {
  return (
    <Suspense >
      <BloodValuesForm />
    </Suspense>
  );
}