# N3mak_Bot
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>نعمك - منصة النعم الذكية</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo&display=swap');

  body {
    margin: 0;
    font-family: 'Cairo', sans-serif;
    background: #f7f9fc;
    color: #222;
    line-height: 1.6;
  }

  header {
    background: #0066cc;
    color: white;
    padding: 20px 15px;
    text-align: center;
  }
  header h1 {
    margin: 0;
    font-weight: 700;
    font-size: 2.5rem;
  }
  header p {
    margin: 8px 0 0;
    font-weight: 400;
  }

  main {
    max-width: 900px;
    margin: 40px auto;
    padding: 0 15px;
  }

  section {
    margin-bottom: 50px;
  }

  h2 {
    color: #0066cc;
    border-bottom: 3px solid #0066cc;
    padding-bottom: 8px;
    margin-bottom: 20px;
  }

  ul {
    list-style-type: none;
    padding: 0;
  }
  ul li {
    background: white;
    margin-bottom: 12px;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.1);
    transition: box-shadow 0.3s ease;
  }
  ul li:hover {
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
  }

  /* نموذج التواصل */
  form {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.1);
    max-width: 500px;
    margin-top: 15px;
  }
  label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
  }
  input, textarea {
    width: 100%;
    padding: 10px 12px;
    margin-bottom: 15px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-family: 'Cairo', sans-serif;
    font-size: 1rem;
    resize: vertical;
  }
  button {
    background: #0066cc;
    color: white;
    border: none;
    padding: 12px 25px;
    border-radius: 30px;
    cursor: pointer;
    font-weight: 600;
    font-size: 1.1rem;
    transition: background 0.3s ease;
  }
  button:hover {
    background: #004a99;
  }

  footer {
    background: #eee;
    text-align: center;
    padding: 15px 10px;
    font-size: 0.9rem;
    color: #555;
  }

  .social-links {
    margin-top: 25px;
    display: flex;
    justify-content: center;
    gap: 15px;
  }
  .social-links a {
    color: #0066cc;
    text-decoration: none;
    font-weight: 700;
    font-size: 1.2rem;
  }
  .social-links a:hover {
    color: #004a99;
  }

  @media (max-width: 600px) {
    header h1 {
      font-size: 1.8rem;
    }
    main {
      margin: 20px 10px;
    }
  }
</style>
</head>
<body>

<header>
  <h1>نعمك</h1>
  <p>منصة ذكية لاكتشاف وتفعيل النعم المالية والرقمية</p>
</header>

<main>
  <section id="about">
    <h2>عن نعمك</h2>
    <p>نظام متكامل يجمع بين واجهة تفاعلية، خدمات مالية، ذكاء اصطناعي، وبوت تيليجرام، ليتيح لك تحويل نعمك غير المستغلة إلى فرص حقيقية.</p>
  </section>

  <section id="features">
    <h2>الميزات الرئيسية</h2>
    <ul>
      <li>واجهة مستخدم تفاعلية على شكل شجرة نعمك</li>
      <li>تحليل ذكي للسوق وخدمات AI متقدمة</li>
      <li>نظام دفع متعدد الوسائل (بطاقات، تحويلات بنكية)</li>
      <li>بوت تيليجرام تفاعلي لتسهيل الوصول للخدمات</li>
      <li>تكامل مع وسائل التواصل الاجتماعي لإدارة المحتوى</li>
      <li>إشعارات ورسائل بريد إلكتروني آلية</li>
    </ul>
  </section>

  <section id="contact">
    <h2>تواصل معنا</h2>
    <p>هل لديك أسئلة أو تريد معرفة المزيد؟ املأ النموذج أدناه وسنعود إليك بأسرع وقت.</p>

    <form action="https://formspree.io/f/mgebjkgk" method="POST">
      <label for="name">الاسم الكامل</label>
      <input type="text" id="name" name="name" required placeholder="اكتب اسمك الكامل" />

      <label for="email">البريد الإلكتروني</label>
      <input type="email" id="email" name="_replyto" required placeholder="example@domain.com" />

      <label for="message">الرسالة</label>
      <textarea id="message" name="message" rows="5" required placeholder="اكتب رسالتك هنا"></textarea>

      <button type="submit">إرسال الرسالة</button>
    </form>

    <div class="social-links">
      <a href="https://t.me/n3mak_bot" target="_blank" rel="noopener">بوت تيليجرام</a>
      <a href="https://twitter.com/n3mak" target="_blank" rel="noopener">تويتر</a>
      <a href="https://facebook.com/n3mak" target="_blank" rel="noopener">فيسبوك</a>
      <a href="https://instagram.com/n3mak" target="_blank" rel="noopener">إنستغرام</a>
    </div>
  </section>
</main>

<footer>
  <p>© 2025 نعمك - جميع الحقوق محفوظة</p>
</footer>

</body>
</html>