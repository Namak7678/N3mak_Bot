import { FeaturePage } from '../FeaturePage';

export default function Page() {
  return (
    <FeaturePage
      icon="🔮"
      title="التنبؤ بأفضل توقيت"
      tagline="اعرف إمتى أفضل وقت تعرض فيه موردك بناءً على الطلب الفعلي."
      roadmap={[
        'تتبع بيانات الطلب على فئة موردك بمرور الوقت',
        'تنبيه تلقائي لما الطلب يوصل لأعلى نقطة',
        'اقتراح توقيت العرض الأنسب لموردك تحديدًا',
      ]}
    />
  );
}
