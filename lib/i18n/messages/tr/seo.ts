import type { Widen } from "../types";
import type { seo as en } from "../en/seo";

/**
 * Türkçe, for the SEO pages' chrome only. The monologues, play titles and
 * names stay as the API gives them, and the library is English for now, so
 * nothing here promises a Turkish piece. Play titles inside sentences stay in
 * English on purpose (Hamlet, Twelfth Night...), the way the library lists them.
 */
export const seo: Widen<typeof en> = {
  seoCommon: {
    faqTitle: "Sık sorulan sorular",
    commonQuestions: "Sık sorulanlar",
    searchesActorsRun: "Oyuncuların gerçekten yaptığı aramalar",
    trySearch: "Aramayı dene",
    search19k: "19.000+ monolog içinde ara",
    related: "İlgili: ",
    links: {
      dramatic: "dramatik monologlar",
      contemporary: "modern monologlar",
      shakespeare: "Shakespeare monologları",
      classical: "klasik monologlar",
      men: "erkekler için monologlar",
      women: "kadınlar için monologlar",
      comedicWomenUnder2: "kadınlar için 2 dakikadan kısa komik monologlar",
      finder: "monolog bulucu",
      audition: "seçme monologları",
      pricing: "fiyatlandırma sayfasına",
    },
    cat: {
      dramatic: "Dramatik monologlar",
      contemporary: "Modern monologlar",
      shakespeare: "Shakespeare monologları",
      women: "Kadınlar için monologlar",
      men: "Erkekler için monologlar",
      twoMin: "2 dakikalık monologlar",
      oneMin: "1 dakikalık monologlar",
      classical: "Klasik monologlar",
    },
  },

  seoDirections: {
    finder: "(arama.)",
    database: "(arşiv.)",
    audition: "(seçme.)",
    contemporary: "(modern repertuvar.)",
    dramatic: "(dramatik ton.)",
    men: "(erkek rolleri.)",
    women: "(kadın rolleri.)",
    shakespeare: "(ozan.)",
    howTo: "(parçayı bulmak.)",
    rehearsal: "(iş başında.)",
    auditionAi: "(ikinci tur.)",
    scenePartner: "(prova.)",
    sources: "(kaynak metinler.)",
    twoMin: "(iki dakika.)",
    oneMin: "(altmış saniye.)",
    comedicWomen: "(kahkahayı al.)",
    contemporaryWomen: "(modern sesler.)",
    dramaticMen: "(derine in.)",
    teens: "(genç oyuncular.)",
    movie: "(perdeden.)",
    shakespeareWomen: "(ozanın kadınları.)",
    classical: "(klasikler.)",
    comedicWomanUnder2: "(kısa komedi.)",
    dramaticContemporary: "(modern dram.)",
  },

  seoFinder: {
    title: "Monolog bulucu: bir sonraki {em} saniyeler içinde bul",
    titleEm: "seçme parçanı",
    lede:
      "ActorRise, oyuncular için yapılmış bir monolog bulucu ve arşiv. Kitapları ya da sıradan listeleri karıştırmak yerine neye ihtiyacın olduğunu düz bir dille anlatıyorsun, saniyeler içinde gerçek monologlardan oluşan kısa bir liste geliyor. Anahtar kelime tahmini yok, ikinci turdan önceki gece antolojileri karıştırmak yok. Arşiv şimdilik İngilizce.",
    b1: "İnternette aranabilir en büyük monolog arşivlerinden biri",
    b2: "“2 dakikadan kısa komik kadın” ya da “öfkeli modern erkek” dediğinde ne demek istediğini anlayan yapay zekâ araması",
    b3: "Yapay zekâ metni değil, oyun yazarlarının gerçek metinleri",
    b4: "Odaya taze bir şeyle girebilmen için çok oynananlar filtresi",
    tryFinder: "Monolog bulucuyu dene",
    howTitle: "Monolog bulucu nasıl çalışır",
    step1Strong: "İhtiyacın olan parçayı anlat.",
    step1:
      "{strong} “İki dakikadan kısa komik kadın” ya da “dram ikinci turu için yoğun modern erkek” gibi bir şey yaz. Arama yalnızca birebir kelimeleri değil, anlamı okur.",
    step2Strong: "Sıralı kısa listeye göz at.",
    step2:
      "{strong} Tonuna, süresine, cinsiyetine ve tarzına uyan, oyunlardan, filmlerden ve dizilerden gelen gerçek monologlar karşına çıkar.",
    step3Strong: "Kaydet, filtrele, prova et.",
    step3: "{strong} Beğendiklerini kaydet, çok oynananları gizle ve en güçlü seçeneği odaya götür.",
    searchesIntro:
      "İhtiyacını doğru anahtar kelimelere çevirmek zorunda değilsin. Bir arkadaşına nasıl söylersen öyle yaz:",
    samples: {
      s1: "genç bir kadın için iki dakikalık dramatik monolog",
      s2: "bir erkek için komik monolog, modern, 90 saniyeden kısa",
      s3: "Shakespeare olmayan klasik bir monolog",
      s4: "modern ayrılık monoloğu, kadın, yüksek riskli",
      s5: "üniversite seçmesi için umut veren bir monolog",
    },
    searchesOutro: "Her sonuç yayımlanmış gerçek bir parça, yani metne güvenebilir ve kaynağına bakabilirsin.",
    realTitle: "Yapay zekâ repliği değil, gerçek metinler",
    real1:
      "ActorRise monolog uydurmaz. Yapay zekâ yazıda değil, aramada. Her sonuç bir oyundan, filmden ya da dizi senaryosundan gerçek bir parça, yani prova ettiğin metni seçmeciler de tanır. Bir parça fazla oynanmaya başladığında çok oynananlar filtresi onu işaretler, böylece o gün üç kişinin daha okuduğu monolog yerine taze bir şey getirirsin.",
    real2:
      "ActorRise’ı ben bir oyuncu olduğum için yaptım. Doğru monoloğu bulmak, provaya ayırmayı tercih edeceğim saatlerimi yiyordu.",
    builtTitle: "Oyuncular, öğrenciler ve koçlar için",
    built:
      "İster profesyonel bir seçmeye, ister bir {college} hazırlan, ister bir {teacher} olarak sınıf çalıştır, bulucu hep aynı şekilde çalışır. Parçanı seçtikten sonra onu {scenePartner} ile sesli çalış; diğer replikleri o okur, sen de istediğin zaman çalışırsın. Tarza ve süreye göre seçilmiş {audition} da göz atabilirsin.",
    lCollege: "üniversite seçmesine",
    lTeacher: "öğretmen",
    faq: {
      q1: "Bunun sıradan bir monolog listesinden farkı ne?",
      a1: "Listeler seni kaydırmaya ve anahtar kelime tahmin etmeye zorlar. Bulucu, düz bir dille anlattığını okur ve tonuna, süresine ve tipine gerçekten uyan parçaları sıralar; kazma işini atlarsın.",
      q2: "Monologlar ücretsiz mi?",
      a2: "Ücretsiz bir katman var ve denemek için kredi kartı gerekmiyor. Ücretli planlar tüm arşivi, kaydedilen parçaları ve ScenePartner provasını açar.",
      q3: "Süreye, cinsiyete ve tona göre arayabilir miyim?",
      a3: "Evet. Süreyi (örneğin iki dakikadan kısa), cinsiyeti, tonu ve tarzı anlat, sonra kısa listeyi gireceğin odaya uyana kadar filtrele.",
      q4: "Monologlar nereden geliyor?",
      a4: "ActorRise yayımlanmış gerçek metinleri düzenler ve her parça kaynağına ve ilk yayımlandığı yere bağlanır. Telif hakkı süren eserlerin tam metinlerini asla barındırmayız. Ayrıntılar: ",
      link: "Kaynaklar ve telif hakkı",
    },
  },

  seoDatabase: {
    title: "Oyuncular için yapılmış {em}",
    titleEm: "monolog arşivi",
    lede:
      "ActorRise aranabilir bir monolog arşivi: oyunlardan, filmlerden ve dizilerden {count} gerçek parça, şimdilik İngilizce. Gerçekten neye ihtiyacın varsa onunla ararsın; ton, süre, cinsiyet, yaş, tema, oyun, dizi. Gerçek metni saniyeler içinde okursun. Kamu malı oyunlar tam metin olarak yer alır.",
    countedTitle: "İçinde ne var, sayılarla",
    stats: {
      pieces: "Monolog",
      plays: "Oyunlardan",
      film: "Filmlerden",
      tv: "Dizilerden",
      publicDomain: "Kamu malı, tam metin",
      underTwo: "İki dakikadan kısa",
    },
    stat: "{n}",
    newest: "En yeni parça {date} tarihinde eklendi. ",
    countsNote:
      "Sayılar canlı kütüphaneden gelir ve her hafta yenilenir. Her parça karakteri, kaynağı ve yazarıyla yayımlanmış bir metindir; burada hiçbir şeyi bir model yazmadı.",
    howTitle: "Arama nasıl çalışır",
    howIntro:
      "Doğru anahtar kelimeleri tahmin etmek zorunda değilsin. Neye ihtiyacın olduğunu sesli söyler gibi anlat, arama sana uyan parçaları sıralasın:",
    samples: {
      s1: "genç bir kadın için iki dakikalık dramatik monolog",
      s2: "bir erkek için 90 saniyeden kısa komik modern monolog",
      s3: "Shakespeare olmayan klasik bir monolog",
      s4: "Euphoria’dan bir şey, ya da o havayı taşıyan herhangi bir şey",
    },
    searchDb: "Arşivde ara",
    browseTitle: "Arşive göz at",
    browseIntro:
      "Aşağıdaki her sayfa kütüphaneden gerçek bir liste, bir tanıtım sayfası değil: parçalar, karakterleri, kaynakları ve süreleri, kamu malı olanların da tam metni.",
    shelf: {
      playH: "Oyuna göre, her konuşma tam metin",
      playN: "Kamu malı oyunlar, yani metnin tamamı sayfada.",
      showH: "Diziye göre",
      showN: "Telifli oldukları için her kayıt karakteri, parçayı ve süreyi verir, gerisini arama açar.",
      themeH: "Temaya göre",
      themeN: "Tüm kütüphanede, klasik ve modern, etiketlenmiş.",
      shelfH: "Cinsiyet, yaş, ton ve süreye göre",
      shelfN: "Seçmelerin hiç değişmeyen istekleri.",
    },
    wider: "Daha geniş kategoriler",
    faq: {
      q1: "Monolog arşivi ne kadar büyük?",
      a1: "{pieces} gerçek monolog: {plays} tanesi oyunlardan, {film} tanesi filmlerden, {tv} tanesi dizilerden, iki binden fazla kaynaktan. {publicDomain} tanesi kamu malı ve tam metin olarak yer alıyor. Arşiv neredeyse her hafta büyüyor; en yeni parçanın tarihi bu sayfada yazıyor. Metinler şimdilik İngilizce.",
      q2: "Monologları aramak ve okumak ücretsiz mi?",
      a2: "Evet. Arama ücretsiz ve kart istemez. Ücretsiz hesapla ayda belli sayıda parçayı tam okursun; Plus sınırı kaldırır ve yapay zekâ sahne partneriyle sınırsız prova ekler.",
      q3: "Bunlar gerçek monologlar mı, yoksa yapay zekâ mı üretti?",
      a3: "Gerçek. Yapay zekâ yazıda değil, aramada. Her kayıt karakteri, kaynağı ve yazarıyla yayımlanmış bir parça, yani prova ettiğin metni seçme odası da tanır.",
      q4: "Çok oynanan parçaları eleyebilir miyim?",
      a4: "Evet. Her parçanın tazeden herkesin bildiği klasiğe uzanan bir klişe puanı var ve arama, her oyuncunun getirdiği parçaları gizleyebilir.",
      q5: "Oyuna, diziye, temaya ya da yaşa göre arayabilir miyim?",
      a5: "Evet. Nasıl söylüyorsan öyle yaz: \"Hamlet’ten bir monolog\", \"intikam üzerine bir şey\", \"komik, genç, iki dakikadan kısa\". Aşağıdaki sayfalar en çok istenen rafları kapsıyor.",
      q6: "Monologlar nereden geliyor?",
      a6: "Tam metin olarak yer alan kamu malı oyunlardan ve karakter, eser ve süreyle listelenen lisanslı ya da kaynak gösterilen modern eserlerden. ActorRise telifli metinleri dağıtmaz. Ayrıntılar: ",
      link: "Kaynaklar ve telif hakkı",
    },
    ctaTitle: "{count} monolog içinde şimdi ara",
    ctaBody: "Doğru parçayı bul, gerçek metni oku ve prova et. Ücretsiz başla, kredi kartı yok.",
  },

  seoAudition: {
    titleEm: "seçme",
    title: "Her ihtiyaca uygun {em} monologları.",
    lede:
      "Klasik, modern ya da komik seçme monoloğu, hangisine ihtiyacın varsa ActorRise ile 19.000+ gerçek parçayı tarza, süreye, cinsiyete ve tona göre arayabilirsin. Uyanı yapay zekâ bulur, sen de kazmaya daha az, provaya daha çok vakit ayırırsın.",
    searchBtn: "Seçme monologlarında ara",
    b1: "{link}: Shakespeare ve ötesi",
    b1Link: "Klasik monologlar",
    b2: "{link}: modern oyunlardan",
    b2Link: "Dramatik modern",
    b3Link: "Komik (örneğin kadın, 2 dakikadan kısa)",
    b4: "Odaya farklı bir şey getirebilmen için çok oynananlar filtresi",
    pickTitle: "Doğru seçme monoloğu nasıl seçilir",
    pickIntro: "En güçlü seçim genelde üç şeye bağlı ve üçünü de filtreleyebilirsin:",
    p1Strong: "Tipine ve role uysun.",
    p1: "{strong} Cinsiyete, yaş aralığına ve tona göre ara ki parça sana aitmiş gibi dursun.",
    p2Strong: "Süre sınırına uy.",
    p2: "{strong} Seçmelerin çoğu bir ila iki dakika ister. Süreye göre filtrele, hiç sözün kesilmesin.",
    p3Strong: "Taze bir şey getir.",
    p3: "{strong} Çok oynananlar filtresi, seçmecilerin durmadan duyduğu parçaları işaretler; kalabalığa karışmak yerine öne çıkarsın.",
    browseTitle: "Türe göre göz at",
    browse:
      "Bir kategoriyle başla, sonra daralt: Shakespeare ve dönem parçaları için {classical}, modern oyunlar için {dramatic}, kahkaha alman gerektiğinde {comedic}. İstersen {finder} ile başlayıp tam olarak ne aradığını da anlatabilirsin.",
    lClassical: "klasik",
    lDramatic: "dramatik modern",
    lComedic: "komik",
    searchesIntro: "Sesli söyler gibi yaz:",
    samples: {
      s1: "bir kadın için modern dramatik monolog, iki dakikadan kısa",
      s2: "bir erkek için komik seçme monoloğu",
      s3: "Shakespeare olmayan klasik bir monolog",
      s4: "bir genç için seçme monoloğu",
      s5: "ikinci tur için yüksek riskli monolog",
    },
    realTitle: "Yapay zekâ repliği değil, gerçek parçalar",
    real1:
      "Her monolog yayımlanmış bir oyundan ya da lisanslı bir kaynaktan geliyor, hiçbirini bir model uydurmadı. Yapay zekâ aramada, yani prova ettiğin metni seçmeciler de tanır. Parçanı seçtikten sonra onu {scenePartner} ile sesli çalış.",
    real2: "Ben bir oyuncuyum ve ActorRise’ı arama kısmı bir akşam yerine birkaç dakika sürsün diye yaptım.",
    faq: {
      q1: "İyi bir seçme monoloğu nasıl olur?",
      a1: "Tipine ve role uyan, süre sınırının içinde kalan ve seçmecilerin o gün on kez duymadığı bir parça. Arama ve çok oynananlar filtresi üçünde de yardımcı olur.",
      q2: "Bir seçme monoloğu ne kadar uzun olmalı?",
      a2: "Seçmelerin çoğu bir ila iki dakika ister. Süreye göre filtreleyebilirsin; “iki dakikadan kısa dramatik monolog” gibi bir şey ara ve sonuçların uyduğuna güven.",
      q3: "Modern ve klasik parçalar var mı?",
      a3: "İkisi de var. Klasik (Shakespeare ve ötesi), dramatik modern ve komik parçalara göz at ya da ne istediğini anlat, gerisini arama ayıklasın.",
      q4: "Monologlar nereden geliyor?",
      a4: "ActorRise yayımlanmış gerçek metinleri düzenler ve her parça kaynağına ve ilk yayımlandığı yere bağlanır. Telif hakkı süren eserlerin tam metinlerini asla barındırmayız. Ayrıntılar: ",
      link: "Kaynaklar ve telif hakkı",
    },
  },

  seoContemporary: {
    title: "{em} için modern monologlar.",
    titleEm: "Seçmeler",
    lede:
      "Bugünün oyunları, bugünün sesleri, canlı hissettiren parçalar. Modern monologları tona, karakter tipine ya da temaya göre ara. Yapay zekâ ne demek istediğini anlar, yani \"aile üzerine yeni bir oyundan komik monolog\" gerçekten işe yarar.",
    searchBtn: "Modern monologlarda ara",
    also: "Şunlara da bak: {dramatic}, {men} ya da {shakespeare}.",
    q1: "Modern monolog neye denir?",
    a1: "Genelde 1950’lerden bu yana yazılmış her şey, ama çoğu kişi son 20 ila 30 yılı kastediyor. Seçme \"modern\" bir parça istiyorsa, genelde bugün insanların gerçekten konuştuğu gibi konuşan modern bir şey bekliyorlardır.",
    q2: "Seçmeler neden modern monolog ister?",
    a2: "Seçmeciler gerçekçi, gündelik dili nasıl taşıdığını görmek ister. Modern parçalar, nazmın ya da yükseltilmiş dilin ek zorluğu olmadan doğal içgüdülerini gösterir.",
    q3: "Oyun yazarına ya da oyunun adına göre arayabilir miyim?",
    a3: "Evet. Oyun yazarının adıyla, oyunun adıyla ya da istediğin parçayı anlatarak arayabilirsin. \"Kardeşler üzerine bir oyundan monolog\" gibi bir şey dene, yapay zekâ uygun eşleşmeleri bulur.",
  },

  seoDramatic: {
    title: "{em} için dramatik monologlar.",
    titleEm: "Seçmeler",
    lede:
      "Ciddi, duygusal, yüksek riskli. Dramatik monologları tona, döneme ya da karakter tipine göre ara. İçini parçalayan bir şey de istesen sessizce yoğun bir şey de, yapay zekâ seni yayımlanmış oyunlardan gerçek parçalarla eşleştirir. Anahtar kelime tahmini yok.",
    searchBtn: "Dramatik monologlarda ara",
    also: "Belirli bir şey mi arıyorsun? Şunları dene: {shakespeare}, {contemporary} ya da {women}.",
    q1: "Seçme için iyi bir dramatik monolog nasıl olur?",
    a1: "İyi bir dramatik monologda net bir risk, duyguda bir kırılma ve oynayacağın bir şey vardır. Baştan sona sadece hüzünlü olan parçalardan kaçın. Karakterin bir şey istediği ve onu almak için aktif olarak uğraştığı bir monolog ara.",
    q2: "Çok oynanmamış bir dramatik monoloğu nasıl bulurum?",
    a2: "ActorRise’ta, seçmecilerin durmadan gördüğü monologları işaretleyen bir çok oynananlar filtresi var. İhtiyacın olanı ara, sonra filtreyi aç; tona hâlâ uyan taze parçalar öne çıksın.",
    q3: "Dramatik monoloğumu ActorRise’ta prova edebilir miyim?",
    a3: "Evet. {link} ile sahneleri ve monologları, diğer replikleri yapay zekâ okurken prova edebilirsin. Herhangi bir monoloğu kaydet ve doğrudan uygulamada çalış.",
  },

  seoMen: {
    title: "{em} için monologlar.",
    titleEm: "Erkekler",
    lede:
      "Komik, dramatik, klasik, modern. Erkekler için monologları tona, süreye, yaş aralığına ya da karakter tipine göre ara. İhtiyacını düz bir dille anlat, mesela \"içi çatışmalı bir baba, ciddi ton, 2 dakikadan kısa\", yayımlanmış oyunlardan gerçek eşleşmeler gelsin.",
    searchBtn: "Erkekler için monologlarda ara",
    also: "Kategoriye göre göz at: {dramatic}, {shakespeare} ya da {contemporary}.",
    q1: "Erkekler için çok oynanmamış iyi monologlar hangileri?",
    a1: "ActorRise’taki çok oynananlar filtresi, seçmecilerin durmadan gördüğü parçaları işaretler. İhtiyacın olanı ara, filtreyi aç; seçmenin tonuna hâlâ uyan taze parçalar gelsin.",
    q2: "Komik mi, dramatik mi monolog yapmalıyım?",
    a2: "Projenin tonuna uy. Seçme bir şey belirtmiyorsa, aralığını hangisi daha iyi gösteriyorsa onu seç. Bazı oyuncular her birinden bir tane hazır tutar. İkisini de arayıp kütüphanene kaydedebilirsin.",
    q3: "Monoloğumu yapay zekâyla çalışabilir miyim?",
    a3: "Evet. {link} ile sahneleri ve monologları, diğer rolleri yapay zekâ okurken baştan sona çalışabilirsin. Sahne partneri aramana gerek yok.",
    a3Link: "ActorRise’ın prova aracı",
  },

  seoWomen: {
    title: "{em} için monologlar.",
    titleEm: "Kadınlar",
    lede:
      "Komik, dramatik, klasik, modern. Kadınlar için monologları tona, süreye, yaş aralığına ya da karakter tipine göre ara. İhtiyacını düz bir dille anlat, mesela \"kendi hakkını savunan güçlü bir kadın, 2 dakikadan kısa\", yayımlanmış oyunlardan gerçek eşleşmeler gelsin.",
    searchBtn: "Kadınlar için monologlarda ara",
    also: "Kategoriye göre göz at: {comedic}, {dramatic} ya da {contemporary}.",
    q1: "Bir seçme için doğru monoloğu nasıl seçerim?",
    a1: "Oyunun tonuna uy. Bir komedi için seçmeye giriyorsan komik bir parça getir. Rol tanımında belirli bir yaş aralığı ya da tip geçiyorsa onu ara. Çok oynananlar filtresi, seçmecilerin bin kez duyduğu parçalardan uzak durmana yardım eder.",
    q2: "Monologları yaş aralığına göre filtreleyebilir miyim?",
    a2: "Evet. Yaş aralığını aramanda anlat, mesela \"20’lerinde bir kadın için monolog\" ya da \"yaşça büyük kadın, 50’ler, ciddi.\" Yapay zekâ doğal dili anlar, açılır menülerden seçim yapman gerekmez.",
    q3: "ActorRise’ta monolog prova edebilir miyim?",
    a3: "Evet. Herhangi bir monoloğu kaydet ve {link} ile prova et; diğer replikleri sesli okur, sen de tek başına çalışırsın.",
  },

  seoShakespeare: {
    title: "Seçmeler için {em} monologları.",
    lede:
      "Hamlet, Macbeth, Twelfth Night, A Midsummer Night's Dream ve onlarcası daha. Shakespeare monologlarını karaktere, tona ya da süreye göre ara. Yapay zekâ neye ihtiyacın olduğunu anlar; \"bir kralın öfkeli konuşması\" ya da \"bir Shakespeare komedisinden komik bir kadın\" diye arayıp gerçek eşleşmeler bulabilirsin.",
    searchBtn: "Shakespeare monologlarında ara",
    also: "Şunlara da göz at: {classical}, {dramatic} ya da {contemporary}.",
    q1: "Seçmeler için hangi Shakespeare monologları iyi?",
    a1: "Role bağlı. Dram için Hamlet, Macbeth ve Othello’da güçlü seçenekler var. Komedi için Twelfth Night, A Midsummer Night's Dream ya da Much Ado About Nothing’i dene. En iyi seçme monoloğu, seçmesine girdiğin oyunun tonuna uyandır. Tona ve karakter tipine göre filtrelemek için aramayı kullan.",
    q2: "Seçme için bir Shakespeare monoloğu ne kadar uzun olmalı?",
    a2: "Seçmelerin çoğu 1 ila 2 dakika ister. Bu kabaca 15 ila 25 dize eder. İlanda bir şey belirtilmemişse 90 saniyenin altını hedefle. Aramada süreye göre filtreleyebilirsin.",
    q3: "ActorRise’ta Shakespeare monologlarının tam metni var mı?",
    a3: "Evet. Shakespeare’in eserleri kamu malı, bu yüzden okuyabileceğin, kaydedebileceğin ve {link} ile prova edebileceğin tam monolog metinlerini koyuyoruz. Metinler İngilizce, oyunların orijinal dilinde.",
  },

  seoHowTo: {
    title: "Seçmen için bir {em} nasıl bulunur",
    titleEm: "monolog",
    lede:
      "Stresin çoğu doğru monoloğu bulmakta: yanlış süre, çok oynanmış bir parça ya da düpedüz sana göre olmayan bir şey. İşte ikinci turdan önceki gece antolojileri karıştırmadan, sana uyan bir parçayı hızla bulmanın basit bir yolu.",
    findNow: "Şimdi bir monolog bul",
    s1Title: "1. Seçmenin gerçekte ne istediğiyle başla",
    s1Intro:
      "Bir parçaya âşık olmadan önce ne istendiğini netleştir. Bir saati çöpe atmanın en hızlı yolu, odanın istemediği güzel bir şey seçmektir. Dört şeyi netleştir:",
    lengthStrong: "Süre.",
    length: "{strong} Seçmelerin çoğu 60 saniye ile 2 dakika arası ister. İlanda bir sayı varsa ona uy ve kendini sesli okuyarak süreni tut.",
    toneStrong: "Ton.",
    tone: "{strong} Komik mi, dramatik mi. Projeye uy. Ciddi bir dramın ikinci turu, en iyi stand up numaranın yeri değil.",
    eraStrong: "Dönem.",
    era: "{strong} Modern mı, klasik mi. Bazı programlar ve okullar, konservatuvarlar dahil, her birinden bir tane ister; hangisini hazırladığını bil.",
    youStrong: "Sen.",
    you: "{strong} Yaş aralığın, oyuncu tipin ve inandırıcı oynayabildiklerin. Parça senin alanının içinde durmalı, başka bir oyuncu için seçmeye girmemeli.",
    s2Title: "2. Şansa göre değil, anlama göre ara",
    s2Intro:
      "Monolog kitaplarını ve sıradan listeleri kazabilirsin, ama bu kaydırmak ve anahtar kelime tahmin etmek demek. Neye ihtiyacın olduğunu bir arkadaşına söyler gibi anlatıp sıralamayı gerçek bir arşive bırakmak daha hızlı:",
    samples: {
      s1: "genç bir kadın için iki dakikalık dramatik monolog",
      s2: "bir erkek için komik monolog, modern, 90 saniyeden kısa",
      s3: "Shakespeare olmayan klasik bir monolog",
      s4: "modern ayrılık monoloğu, kadın, yüksek riskli",
    },
    s2Outro:
      "{link} tam olarak bunu yapar. Anlattığını okur ve oyunlardan, filmlerden ve dizilerden 19.000+ parça arasından tonuna, süresine, cinsiyetine ve tipine uyan gerçek monologları sıralar. Arşiv şimdilik İngilizce.",
    s2Link: "ActorRise monolog bulucu",
    s3Title: "3. İşe yarayanı seç, çok oynananları atla",
    s3p1:
      "İyi bir seçme monoloğu oynanabilir, aktif ve tazedir. Kısa listen olunca sana bir şey yaptırtan, gerçek bir kırılması ya da riski olan ve o gün diğer her oyuncunun getirdiği eskimiş klasik olmayan parçayı seç. En çok kesilen parçalar ünlü olanlardır; onları gizlemek için çok oynananlar filtresini kullan ve jürinin henüz on iki kez duymadığı bir şeyi öne çıkar.",
    s3p2:
      "Tam metni oku, kaynağa bak ve parçanın bağlamından kopunca da kendi başına durduğundan emin ol. Anlaşılması için bütün oyun gerekiyorsa aramaya devam et.",
    s4Title: "4. Sayfadan kopana kadar prova et",
    s4p:
      "Parçayı bulmak işin yarısı. O artık seninse, ezberleyip bedenine oturana kadar sesli çalış. ActorRise’ta bir monoloğu bulduğun anda prova edebilirsin: bir spot ışığı sesini satır satır takip eder, böylece odaya girmeden çok önce metni sayfadan koparırsın.",
    browseTitle: "İhtiyacına göre göz at",
    faq: {
      q1: "Bana uyan bir monoloğu nasıl bulurum?",
      a1: "Seçmenin istediğiyle başla (süre, ton, modern ya da klasik), sonra yaş aralığına ve tipine göre daralt. Bunu düz bir dille anlat ve antolojileri karıştırmak yerine gerçek bir arşivde ara. ActorRise tonuna, süresine ve tipine uyan parçaları saniyeler içinde sıralar.",
      q2: "Ücretsiz monologu nerede bulabilirim?",
      a2: "ActorRise’ta ücretsiz bir katman var ve denemek için kredi kartı gerekmiyor. Yayımlanmış gerçek monologları hemen arayıp okuyabilirsin; ücretli planlar yapay zekâyla sınırsız prova açar.",
      q3: "Bir seçme monoloğu ne kadar uzun olmalı?",
      a3: "İlanda aksi yazmıyorsa seçmelerin çoğu 60 saniye ile 2 dakika arası ister. Süreni her zaman sesli okuyarak tut ve kısaltmanı isterlerse diye daha kısa bir versiyonu hazır tut.",
      q4: "Çok oynanmış bir monologdan nasıl kaçınırım?",
      a4: "En çok kesilen parçalar, her oyuncunun getirdikleridir. Eskimiş klasikleri gizlemek ve tonuna ve tipine hâlâ uyan daha taze seçenekleri öne çıkarmak için çok oynananlar filtresini kullan.",
      q5: "Monologlar nereden geliyor?",
      a5: "Kamu malı ve lisanslı kaynaklardan. ActorRise yayımlanmış gerçek metinleri düzenler, telifli oyun metinlerini dağıtmaz. Ayrıntılar: ",
      link: "Kaynaklar ve telif hakkı",
    },
    ctaTitle: "Monoloğunu saniyeler içinde bul",
    ctaBody:
      "Neye ihtiyacın olduğunu anlat, gerçek parçalardan kısa bir liste al ve en güçlüsünü prova et. Ücretsiz başla, kredi kartı yok.",
  },

  seoRehearsal: {
    title: "Oyuncular için yapay zekâ {em} aracı",
    titleEm: "prova",
    lede:
      "Malzemeni bul ve aynı yerde prova et. ActorRise, yapay zekâ destekli monolog aramasını ScenePartner ile birleştirir: diğer replikleri sesli okuyan bir prova aracı, böylece sahneleri ve monologları kendi programına göre çalışırsın.",
    b1Strong: "Malzeme bul",
    b1: "{strong}: 19.000+ monolog, film ve dizi içinde anahtar kelimeyle değil, anlamla ara.",
    b2Strong: "Sahne prova et",
    b2: "{strong}: ScenePartner diğer replikleri okur, girişlerini dinler ve sahneyi akışta tutar.",
    b3Strong: "Seçme hazırlığı",
    b3: "{strong}: çok oynananlar filtresi, tipine uygun eşleştirme ve seçme metni çalışma; odaya hazır girersin.",
    learnSp: "ScenePartner’ı tanı",
    looking: "Malzeme mi arıyorsun? {finder} aracını dene, {audition} sayfasına göz at ya da {women} ve {men} sayfalarını keşfet.",
    q1: "ActorRise’ı kullanmak ücretsiz mi?",
    a1: "Evet. Ücretsiz katman monolog aramasına ve sınırlı ScenePartner seanslarına erişim verir. Kredi kartı gerekmez. Ücretli planların ayrıntıları için {pricing} bak.",
    q2: "Bir arkadaşla prova etmekten farkı ne?",
    a2: "İhtiyacın olduğu her an orada. Randevu yok, rica minnet yok. ScenePartner replikleri her seferinde aynı tutarlılıkla okur; ezber çalışmak ve seçimlerini gerçek bir sahne partnerine götürmeden önce denemek için birebir.",
    q3: "Ne tür malzemeleri prova edebilirim?",
    a3: "Her şeyi. 19.000+ parçalık arşivdeki monologları ve sahneleri, yapıştırdığın kendi seçme metinlerini ya da senaryolarını veya kütüphanemizdeki film ve dizi monologlarını.",
  },

  seoAuditionAi: {
    title: "Performansın yerine geçmeyen, {em} yardım eden seçme yapay zekâsı",
    titleEm: "hazırlanmana",
    lede:
      "ActorRise yapay zekâyı doğru malzemeyi bulman ve prova etmen için kullanır; metin üretmez, bir oyuncu olarak yaptığın işin yerini almaz. Aradığın ve çalıştığın her şey yayımlanmış gerçek oyunlardan ve film ve dizilerden gelir.",
    b1Strong: "Monolog arama",
    b1: "{strong}: neye ihtiyacın olduğunu düz bir dille anlat. Seni yalnızca anahtar kelimeyle değil, anlamla 19.000+ gerçek monologla eşleştirir.",
    b2: "{strong}: diğer replikleri okuyan yapay zekâyla sahne prova et. Seçme metinlerini, film ve dizi referanslarını ve kaydettiğin monologları çalış, odaya hazır gir.",
    b3Strong: "Audition Mode",
    b3: "{strong}: tipine uygunluk ve çok oynananlar filtreleri; role uyan ve seçmecilere taze gelen parçalarla gelirsin.",
    b4: "Gerçek metni bulur ve düzenler. Monolog uydurmaz, üretmez.",
    whatTitle: "Yapay zekâ ne yapar, ne yapmaz",
    what1:
      "“Oyuncular için yapay zekâ” çoğu zaman bir modelin sahte sahneler yazması demek. ActorRise tam tersini yapar. Yapay zekâ anlattığını okur ve seni yayımlanmış gerçek parçalara yönlendirir, prova edebilmen için sahne partnerinin repliklerini sana okur. Monoloğu asla yazmaz.",
    what2:
      "Bu, odada fark yaratır. Seçmeciler gerçek malzemeyi tanır ve bir oyuna ya da filme dayandırabildiğin bir parça, üretilmiş bir parçanın asla dayanamayacağı sorulara dayanır.",
    searchTitle: "Monolog arama",
    search:
      "“Bir kadın için iki dakikadan kısa modern dramatik monolog” gibi bir şey yaz, sana uyan gerçek parçalardan sıralı bir kısa liste al. Anahtar kelime tahmini yok. {finder} ile başla ya da türe göre {audition} göz at.",
    sp: "Tek başına prova etmek işin zor kısmı. ScenePartner diğer replikleri okur, böylece bir arkadaşından rica etmeden, istediğin an bir sahneyi ya da monoloğu sesli çalışırsın. Nasıl çalıştığını {link} gör.",
    spLink: "ScenePartner sayfasında",
    modeTitle: "Audition Mode ve çok oynananlar filtresi",
    mode1:
      "Belirli bir seçmeye hazırlanırken Audition Mode seçenekleri tipine ve role göre daraltır, çok oynananlar filtresi de seçmecilerin durmadan duyduğu parçaları işaretler; sen de onların duymadığı bir şey getirirsin.",
    mode2:
      "ActorRise’ı ben bir oyuncu olduğum için yaptım. İşi benim yerime yapmaya çalışan değil, zanaate saygı duyan hazırlık araçları istedim.",
    faq: {
      q1: "ActorRise monologları yapay zekâyla mı yazıyor?",
      a1: "Hayır. Yapay zekâ yazıda değil, aramada ve provada. Her monolog yayımlanmış gerçek bir parça, yani getirdiğin şeyi seçmeciler tanıyabilir.",
      q2: "ScenePartner nedir?",
      a2: "Yapay zekâ bir okuma partneri. Bir sahnedeki diğer replikleri okur, böylece sana giriş verecek birini ayarlamadan seçme metnini ya da monoloğunu istediğin an sesli çalışırsın.",
      q3: "Audition Mode nedir?",
      a3: "Tipine uygunluk ve çok oynananlar filtreleriyle odaklı bir düzen; role uyan ve seçmecilere taze gelen parçalarla girersin.",
      q4: "Ücretsiz bir katman var mı?",
      a4: "Evet, başlamak ücretsiz ve kredi kartı gerekmiyor. Ücretli planlar tüm arşivi, kaydedilen parçaları ve ScenePartner provasını açar.",
    },
  },

  seoScenePartner: {
    title: "Sahne partneri yapay zekâ: istediğin an {em}, randevu yok",
    titleEm: "prova et",
    lede:
      "ScenePartner diğer replikleri sesli okur, böylece sahneleri tek başına prova edersin. Seçmeden önce metnini çalış, film ve dizi sahneleri üzerinde çalış ya da monologları bağlamıyla birlikte ele al. Senin repliklerini dinler ve bir sonraki girişle karşılık verir.",
    b1Strong: "Seçme metnini çalış",
    b1: "{strong}: seçme metnini yapıştır ya da yükle, diğer rolleri yapay zekâ okurken prova et.",
    b2Strong: "Film ve dizi sahneleri",
    b2: "{strong}: ikonik senaryolardan alınmış monologlarla prova et.",
    b3Strong: "Randevu yok",
    b3: "{strong}: gece ikide, metroda ya da seçmeden beş dakika önce prova et. Kimseden rica etmene gerek yok.",
    learnMore: "Seçmeler için yapay zekâ hakkında daha fazlası",
    need: "Önce malzeme mi lazım? {finder} aracını dene ya da {dramatic} ve {contemporary} sayfalarına göz at.",
    q1: "ScenePartner AI nasıl çalışır?",
    a1: "Bir sahne ya da monolog seç, oynamak istediğin karakteri belirle ve başlat. ScenePartner diğer replikleri metinden sese dönüştürerek sesli okur. Giriş repliklerini dinler ve kendiliğinden ilerler, yani elini kullanmadan prova edersin.",
    q2: "ScenePartner ücretsiz mi?",
    a2: "Ücretsiz katmanda sınırlı ScenePartner seansları var. Sınırsız prova için {pricing} bak.",
    q3: "Kendi seçme metinlerimi ya da senaryolarımı kullanabilir miyim?",
    a3: "Evet. Kendi seçme metinlerini yapıştırabilir ya da yükleyebilir ve ScenePartner ile prova edebilirsin. Yalnızca ActorRise arşivindeki malzemeyle değil, her metinle çalışır.",
  },

  seoSources: {
    title: "Kaynaklar ve {em}.",
    titleEm: "telif hakkı",
    lede:
      "ActorRise monologlar için bir arama ve keşif aracı. Kamu malı eserler tam metin olarak yer alır. Telif hakkı hâlâ süren her şey yalnızca kısa bir alıntı olarak, tek bir konuşma, kaynak gösterilerek ve orijinaline bağlantıyla yer alır. Telifli bir eserin tam metnini asla barındırmayız.",
    whereTitle: "İçeriğimiz nereden geliyor",
    pdStrong: "Kamu malı eserler",
    pd: "{strong}: Shakespeare, Ibsen, Çehov, Molière ve Wilde gibi telif süresi dolmuş oyunlar, çoğunlukla Project Gutenberg’den. Bunların telifi sona erdiği için konuşmayı tam olarak veriyor ve geldiği baskıya bağlantı veriyoruz.",
    crStrong: "Telif hakkı hâlâ süren film, dizi ve modern oyunlar",
    crExcerpt: "kısa bir alıntı",
    cr: "{strong}: yalnızca {excerpt} veriyoruz; on binlerce kelimelik bir senaryodan ya da oyun metninden alınmış, tek bir karakterin yaklaşık yüz otuz kelimelik konuşması. Her alıntı eserin adını, yazarını ve karakteri belirtir ve eserin tamamını satın almak ya da okumak için dışarıya bağlantı verir. Bu alıntılar hak sahibinden alınmış bir lisansla değil, adil kullanım kapsamında kullanılır ve hiçbirinin sahipliğini iddia etmeyiz.",
    noneStrong: "Hiç metin tutmadığımız eserler",
    none: "{strong}: bazı eserler için yalnızca oyunu, karakteri ve yayıncıya bir bağlantıyı listeliyoruz, sayfada hiç metin yok. Bir pasajı çoğaltmak için net bir dayanağımız yoksa, onu alıntılamak yerine seni ona yönlendirmeyi tercih ederiz.",
    fullTitle: "Tam metinler",
    full: "Telifli hiçbir oyunun, filmin ya da dizinin tam metnini barındırmayız, dağıtmayız ve burada birinin böyle bir metni edinmesinin bir yolu yok. ActorRise tek bir seçme parçasını bulmak ve prova etmek için var. Eserin tamamını istediğinde seni yayıncıya ya da lisanslı bir satıcıya yönlendiririz; satın alınması gereken yer orası.",
    removalTitle: "İçerik kaldırma",
    removal:
      "Bir hak sahibiysen ya da birini temsil ediyorsan ve bir alıntının kaldırılmasını ya da düzeltilmesini istiyorsan, parçanın bağlantısıyla birlikte {email} adresine e-posta gönder. Talepler hızla, genelde bir gün içinde karşılanır.",
    questions: "Belirli bir kaynak ya da telif hakkı hakkında soruların varsa lütfen {contact}.",
    contactLink: "bize yaz",
  },

  seoMonologue: {
    eyebrow: "Monolog",
    titleFrom: "{play} eserinden {character} monoloğu",
    titleOnly: "{character} monoloğu",
    from: "Eser: {play}",
    by: ", yazan: {author}",
    rehearseThisFree: "Bunu ücretsiz prova et",
    findMore: "Daha fazla monolog bul",
    copyrightFilm:
      "Bu parça telif hakkı süren bir filmden, bu yüzden tam metni burada yayımlanmıyor. Repliklerin kendi kopyasını getirip ActorRise’ta prova edebilirsin.",
    copyrightTv:
      "Bu parça telif hakkı süren bir diziden, bu yüzden tam metni burada yayımlanmıyor. Repliklerin kendi kopyasını getirip ActorRise’ta prova edebilirsin.",
    copyrightWork:
      "Bu parça telif hakkı süren bir eserden, bu yüzden tam metni burada yayımlanmıyor. Repliklerin kendi kopyasını getirip ActorRise’ta prova edebilirsin.",
    about: "Bu parça hakkında",
    ageUp: "{age} ve üzeri",
    lenMin: "{mm}:{ss} dk",
    lenSec: "{ss} sn",
    rehearseTitle: "{character} monoloğunu prova et",
    rehearseBody:
      "Sesini satır satır takip eden bir spot ışığıyla, metin sayfadan kopana kadar sesli çalış. Ücretsiz başla, kredi kartı yok.",
    rehearseFree: "Ücretsiz prova et",
    moreFrom: "{play} eserinden daha fazlası",
    everySpeech: "{play} eserindeki her konuşma, tam metin",
    browse: "Göz at",
    wholeDb: "Arşivin tamamı",
  },

  seoCollection: {
    searchAll: "Hepsinde ara",
    nothing: "Şu an bu rafta eşleşen bir şey yok. {link}.",
    fromPlay: ", {play}",
    film: "film",
    tv: "dizi",
    play: "oyun",
    lenMin: "{len} dk",
    lengthNote:
      "Süre, dakikada yaklaşık 130 kelimelik bir oyun temposuyla ve her cümlede bir nefesle tahmin edilir. Kamu malı parçalar kendi sayfalarında tam metin olarak yer alır; telifli olanlarda karakter ve kaynak listelenir.",
    notYet: "Aradığın bu değil mi?",
    notYetBody:
      "Parçayı bir koça anlatır gibi anlat, arama yalnızca bu rafı değil bütün arşivi okusun. Ücretsiz başla, kredi kartı yok.",
    searchCorpus: "Bütün arşivde ara",
  },

  seoGhostLight: {
    line: "Bunu mu ezberliyorsun? {link} kaydettiğin parçaları telefonunda tutar ve çevrimdışı da açar, kuliste ya da trende. iPhone’da ücretsiz.",
  },

  seoShelf: {
    twoMin: {
      h1: "İki dakikalık monologlar",
      intro:
        "İki dakika en yaygın seçme süresi; odayı kaybetmeden aralığını göstermeye yetecek kadar uzun. Gerçek monologlarda ara, tona ve tipe göre filtrele, sana uyan iki dakikalık bir parça bul.",
      b1: "İki dakika civarında biten parçalara göre filtrele",
      b2: "Klasik, modern, komik ya da dramatik",
      b3: "İki dakikan taze gelsin diye çok oynananlar filtresi",
      r1: "bir dakikalık monologlar",
      r2: "seçme monologları",
      r3: "monolog bulucu",
    },
    oneMin: {
      h1: "Bir dakikalık monologlar",
      intro:
        "Bazı seçmeler sana altmış saniye verir ve süreyi aşmak sana pahalıya patlayabilir. Gerçek monologlarda ara ve kısa parçalara göre filtrele; seçmeler, ders ya da hızlı bir self tape için elinde güçlü bir dakikalık seçenek olsun.",
      b1: "Bir dakikalık slota sığan kısa parçalara göre filtrele",
      b2: "Komik ya da dramatik, her tip için",
      b3: "Yayımlanmış gerçek metin, çok oynananlar filtresiyle",
      r1: "iki dakikalık monologlar",
      r2: "seçme monologları",
      r3: "monolog bulucu",
    },
    comedicWomen: {
      h1: "Kadınlar için komik monologlar",
      intro:
        "Seçmede komedi taklit edilmez, o yüzden parça sana uymalı. 19.000+ gerçek monologda tona ve süreye göre ara, bir kadın için gerçekten güldüren komik bir parça bul, sonra seçmecilerin her gün duyduklarını ele.",
      b1: "Süreye göre ara, mesela iki dakikadan kısa komik monolog",
      b2: "Oyunlardan, filmlerden ve dizilerden gerçek parçalar, asla yapay zekâ üretimi değil",
      b3: "Seçmecilerin on kez duymadığı bir şey getir diye çok oynananlar filtresi",
      r1: "kadınlar için modern monologlar",
      r2: "kadınlar için monologlar",
      r3: "seçme monologları",
    },
    contemporaryWomen: {
      h1: "Kadınlar için modern monologlar",
      intro:
        "Seçmeciler sık sık modern ve tanıdık bir şey ister. Güncel oyunlardan, filmlerden ve dizilerden kadınlar için gerçek monologlarda ara, tona ve süreye göre filtrele ki parça odaya uysun.",
      b1: "Gerçek oyunlardan ve ekrandan modern parçalar, uydurma metin değil",
      b2: "Tona, yaş aralığına ve süreye göre filtrele",
      b3: "Çok oynananlar filtresi, seçmecilerin durmadan duyduğu parçaları işaretler",
      r1: "kadınlar için komik monologlar",
      r2: "modern monologlar",
      r3: "kadınlar için monologlar",
    },
    dramaticMen: {
      h1: "Erkekler için dramatik monologlar",
      intro:
        "Güçlü bir dramatik monolog sana gidecek bir yer verir. Erkekler için gerçek parçalarda yoğunluğa, yaş aralığına ve süreye göre ara; herkesin yaptığı konuşma yerine tipine uyan bir şey getir.",
      b1: "Oyunlardan, filmlerden ve dizilerden gerçek dramatik parçalar",
      b2: "Süreye göre filtrele, mesela iki dakikadan kısa dramatik monolog",
      b3: "Kalabalığa karışma, öne çık diye çok oynananlar filtresi",
      r1: "dramatik monologlar",
      r2: "erkekler için monologlar",
      r3: "seçme monologları",
    },
    teens: {
      h1: "Gençler için monologlar",
      intro:
        "Genç oyuncuların, zorla uydurulmuş yetişkin konuşmaları değil, yaşlarına uyan ve dürüst okunan parçalara ihtiyacı var. Gerçek monologlarda yaş aralığına, tona ve süreye göre ara; genç bir oyuncuya uyan seçme ve ders malzemesi bul.",
      b1: "Parça bir gence uysun diye yaş aralığına göre filtrele",
      b2: "Ders ya da seçmeler için komik ve dramatik seçenekler",
      b3: "Yayımlanmış gerçek metin, ücretsiz başla",
      r1: "öğrenciler ve eğitmenler",
      r2: "seçme monologları",
      r3: "monolog bulucu",
    },
    movie: {
      h1: "Seçmeler için film monologları",
      intro:
        "Tanıdık bir şey istediğinde film monologları showreel’ler ve modern seçmeler için harika olabilir. Gerçek senaryolardan alınmış parçalarda tona, süreye ve karakter tipine göre ara, sonra onları ScenePartner ile prova et.",
      b1: "Uydurma sahnelerden değil, gerçek filmlerden alınmış parçalar",
      b2: "Tona, süreye ve karakter tipine göre filtrele",
      b3: "Diğer replikleri ScenePartner okurken prova et",
      r1: "ScenePartner",
      r2: "seçme monologları",
      r3: "modern monologlar",
    },
    shakespeareWomen: {
      h1: "Kadınlar için Shakespeare monologları",
      intro:
        "Shakespeare klasik seçmelerin çoğunda karşına çıkar ve doğru konuşma seni ayırabilir. Oyunların tamamında kadınlar için monologlarda karaktere, tona ve süreye göre ara; çok bilinenlerden nadiren duyulanlara kadar.",
      b1: "Komedilerden, tragedyalardan ve tarih oyunlarından parçalar",
      b2: "Karaktere, tona ve süreye göre filtrele",
      b3: "Herkesin getirdiği konuşmaları atla diye çok oynananlar filtresi",
      r1: "Shakespeare monologları",
      r2: "klasik monologlar",
      r3: "kadınlar için monologlar",
    },
    classical: {
      title: "Seçmeler için {em} monologlar",
      titleEm: "klasik",
      lede:
        "Shakespeare’den diğer klasik metinlere. Oyuna, karakter tipine ya da ruh haline göre ara. Arşivimizde binlerce klasik parça var ve yapay zekâ yalnızca yazdığın kelimeleri değil, ne demek istediğini anlar.",
    },
    comedicWomanUnder2: {
      title: "Kadın için 2 dakikadan kısa {em} monolog",
      titleEm: "komik",
      lede:
        "En sık gördüğümüz aramalardan biri. ActorRise’ta kadınlar için binlerce komik monolog var ve süreye, tona ve tarza göre filtreleyebilirsin. Ya da sadece neye ihtiyacın olduğunu düz bir dille anlat.",
    },
    dramaticContemporary: {
      title: "{em} bir oyundan dramatik monolog",
      titleEm: "Modern",
      lede:
        "Ciddi, modern ve çok oynanmamış bir şey mi arıyorsun? Modern oyunlardan binlerce dramatik monoloğumuz var. Duyguya, ilişkiye ya da süreye göre ara. Anahtar kelime tahmini yok.",
    },
  },
};
