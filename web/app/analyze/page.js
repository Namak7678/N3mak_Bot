import { FeaturePage } from '../FeaturePage';

export default function Page() {
  return (
    <FeaturePage
      icon="🧠"
      title="التحليل الذكي"
      tagline="تقييم فوري لقيمة موردك وأفضل سعر عادل له."
      roadmap={[
        'ترفع صورة أو وصف للمورد عبر البوت',
        'الذكاء الاصطناعي يقارنه بأسعار السوق الفعلية',
        'تاخد تقييم سعر مقترح خلال ثواني',
      ]}
    />
  );
}
