import { FeaturePage } from '../FeaturePage';

export default function Page() {
  return (
    <FeaturePage
      icon="🗺️"
      title="الخريطة المكانية"
      tagline="شوف الفرص القريبة منك جغرافيًا."
      roadmap={[
        'تفعّل الموقع من داخل البوت',
        'تشوف موارد وفرص قريبة منك على خريطة تفاعلية',
        'تفلتر حسب المسافة أو نوع المورد',
      ]}
    />
  );
}
