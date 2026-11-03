import type { Widen } from "../types";
import type { content as en } from "../en/content";

/**
 * Türkçe, for the blog, the guides, the legal pages and the collection
 * shelves. Play, film and show titles, character names and quoted lines stay
 * in English, the way the library lists them. Nothing here promises a Turkish
 * monologue. The legal pages are a courtesy translation: the English is binding.
 */

const COPYRIGHT_TAIL =
  "Metin telifli; bu yüzden her kayıtta karakter, parça ve süre yazıyor, gerisini arama açıyor.";

export const content: Widen<typeof en> = {
  contentCollections: {
    "comedic-monologues-for-women-under-2-minutes": {
      title: "Kadınlar için 2 dakikadan kısa komik monologlar",
      em: "komik",
      h1: "Kadınlar için iki dakikadan kısa {em} monologlar",
      direction: "(çabuk komedi.)",
      intro:
        "Hiç değişmeyen seçme talebi: komik, kadın ve süre dolmadan bitmiş. Aşağıdaki her parça iki dakikadan kısa. Klasik olanlar kamu malı ve tam metin olarak basılı.",
    },
    "dramatic-monologues-for-women-under-2-minutes": {
      title: "Kadınlar için 2 dakikadan kısa dramatik monologlar",
      em: "dramatik",
      h1: "Kadınlar için iki dakikadan kısa {em} monologlar",
      direction: "(salonu tut.)",
      intro:
        "İki dakikanın içinde etkisini gösteren dramatik bir parçayı bulmak uzun bir parçayı bulmaktan zordur. Bunlar gösteriyor. Ünlerine göre değil, tek başlarına ne kadar iyi okunduklarına göre sıralandılar.",
    },
    "comedic-monologues-for-men-under-2-minutes": {
      title: "Erkekler için 2 dakikadan kısa komik monologlar",
      em: "komik",
      h1: "Erkekler için iki dakikadan kısa {em} monologlar",
      direction: "(çabuk komedi.)",
      intro:
        "Komik, erkek ve kısa. Buradaki her parça iki dakikadan kısa; bir kez okursun ve senin olup olmadığını anlarsın.",
    },
    "dramatic-monologues-for-men-under-2-minutes": {
      title: "Erkekler için 2 dakikadan kısa dramatik monologlar",
      em: "dramatik",
      h1: "Erkekler için iki dakikadan kısa {em} monologlar",
      direction: "(salonu tut.)",
      intro:
        "Parça bunun için yazılmışsa iki dakika bir salonu çevirmeye yeter. Bunlar öyle yazılmış. Süre konuşma temposuyla tahmin ediliyor, yani on saniye artı eksi güvenebilirsin.",
    },
    "one-minute-monologues-for-women": {
      title: "Kadınlar için bir dakikalık monologlar",
      em: "bir dakikalık",
      h1: "Kadınlar için {em} monologlar",
      direction: "(altmış saniye.)",
      intro:
        "Altmış saniyelik slot için: bir genel seçme, bir showcase, bir dakika isteyen ve bunu gerçekten kasteden bir self-tape. Buradaki her şey o süre içinde bitiyor.",
    },
    "one-minute-monologues-for-men": {
      title: "Erkekler için bir dakikalık monologlar",
      em: "bir dakikalık",
      h1: "Erkekler için {em} monologlar",
      direction: "(altmış saniye.)",
      intro:
        "Kısa olmak bir beceridir. Bu parçalar söyleyeceğini söyleyip bir dakika içinde çekiliyor; bir dakikalık slotun senden istediği de tam olarak bu.",
    },
    "contemporary-monologues-for-teens": {
      title: "Gençler için modern monologlar",
      em: "modern",
      h1: "Gençler için {em} monologlar",
      direction: "(senin yaşın, senin sesin.)",
      intro:
        "Yaşayan yazarların yazdığı genç karakterler; yaşı üstü çizilmiş otuzluk birinin konuşması değil. Bu kaynakların çoğu telifli, bu yüzden sayfa parçayı ve nerede bulunduğunu listeliyor.",
    },
    "classical-monologues-for-women": {
      title: "Kadınlar için klasik monologlar",
      em: "klasik",
      h1: "Kadınlar için {em} monologlar",
      direction: "(eski sözler.)",
      intro:
        "Shakespeare, Yunanlar, Restorasyon komedisi, Ibsen, Çehov ve çevrelerindeki yazarlar. Hepsi kamu malı, hepsi tam metin; karar vermeden önce konuşmanın tamamını okuyabilirsin.",
    },
    "contemporary-dramatic-monologues-for-women": {
      title: "Kadınlar için modern dramatik monologlar",
      em: "modern",
      h1: "Kadınlar için {em} dramatik monologlar",
      direction: "(şimdi, ve ciddi.)",
      intro:
        "Son birkaç on yıldan kadınlar için ciddi parçalar. Kaynakların çoğu telifli; bu yüzden her kayıt sana karakteri, eseri ve süreyi söylüyor, gerisini arama açıyor.",
    },
    "contemporary-dramatic-monologues-for-men": {
      title: "Erkekler için modern dramatik monologlar",
      em: "modern",
      h1: "Erkekler için {em} dramatik monologlar",
      direction: "(şimdi, ve ciddi.)",
      intro:
        "Son birkaç on yıldan erkekler için ciddi parçalar; karaktere, esere ve süreye göre listelendi. Çoğu telifli, yani metin hak sahibinde duruyor, gerisini arama açıyor.",
    },
    "contemporary-comedic-monologues-for-women": {
      title: "Kadınlar için modern komik monologlar",
      em: "modern",
      h1: "Kadınlar için {em} komik monologlar",
      direction: "(şimdi, ve komik.)",
      intro:
        "Komik ve yeni. Arşivdeki en ince raf bu; başka her yerde karşılanması en zor arama olmasının sebebi de bu. Her kayıt karakteri, eseri ve süreyi veriyor.",
    },
    "monologues-for-women-over-40": {
      title: "40 yaş üstü kadınlar için monologlar",
      em: "monologlar",
      h1: "40 yaş üstü kadınlar için {em}",
      direction: "(repliklerin ardında bir hayat.)",
      intro:
        "Geçmişi olan karakterler. Klasik ve modern kaynaklardan, kırklı yaşlarındaki ve daha büyük kadınlar için yazılmış; yani yaş yalnızca oyuncu seçme notunda değil, metnin kendisinde.",
    },
    "hamlet-monologues": {
      title: "Hamlet monologları: her konuşma, tam metin",
      em: "Hamlet",
      h1: "{em} monologları, tam metin",
      direction: "(prens, ve çevresindeki herkes.)",
      intro:
        "Oyundan altmış küsur konuşma, yalnızca ünlü dördü değil. Hamlet'in kendi konuşmaları burada; Kral'ınkiler, öğüt veren Polonius, Horatio, Hayalet, oyuncular, Ophelia ve Kraliçe de öyle. Hepsi kamu malı, hepsi eksiksiz basılı, her biri konuşma temposuyla zamanlanmış.",
    },
    "macbeth-monologues": {
      title: "Macbeth monologları: her konuşma, tam metin",
      em: "Macbeth",
      h1: "{em} monologları, tam metin",
      direction: "(iskoç oyunu.)",
      intro:
        "Macbeth'in kendi yirmi bir konuşması, Lady Macbeth'in altısı ve ünlülerin ötesini hiç okumadıkları için kimsenin odaya getirmediği konuşmalar: Malcolm, Kapıcı, Lady Macduff, Hecate. Kamu malı, eksiksiz basılı, zamanlanmış.",
    },
    "romeo-and-juliet-monologues": {
      title: "Romeo and Juliet monologları: her konuşma, tam metin",
      em: "Romeo and Juliet",
      h1: "{em} monologları, tam metin",
      direction: "(iki hane.)",
      intro:
        "Romeo'nun sekizi, Juliet'in onu, Rahip'in altısı, Dadı, Mercutio, Capulet, Benvolio ve Prens. Dört yüz yıl önce genç oyuncular için yazılmış ve hâlâ en çok istenen klasik seçme parçaları. Kamu malı, eksiksiz basılı.",
    },
    "othello-monologues": {
      title: "Othello monologları: her konuşma, tam metin",
      em: "Othello",
      h1: "{em} monologları, tam metin",
      direction: "(mendil.)",
      intro:
        "Burada Iago'nun yirmi dört konuşması var, çoğu seyirciye. Othello'nun on biri, Desdemona'nın beşi ve Emilia'nın kocalar üzerine tek konuşması; hakkı verilenden çok daha fazla salon kazanır. Kamu malı, eksiksiz basılı.",
    },
    "king-lear-monologues": {
      title: "King Lear monologları: her konuşma, tam metin",
      em: "King Lear",
      h1: "{em} monologları, tam metin",
      direction: "(fırtına.)",
      intro:
        "Lear'ın on sekizi, Edgar'ın on biri, Edmund'un dokuzu, Goneril, Kent, Gloucester, Soytarı, Regan ve Cordelia. Oyun, kanondaki diğer tüm oyunlardan daha fazla tek başına durabilen konuşmaya sahip ve çoğu bir seçmede hiç duyulmaz. Kamu malı, eksiksiz basılı.",
    },
    "a-midsummer-nights-dream-monologues": {
      title: "A Midsummer Night's Dream monologları: tam metin",
      em: "A Midsummer Night's Dream",
      h1: "{em} monologları, tam metin",
      direction: "(atina dışındaki orman.)",
      intro:
        "Helena'nın altısı, Theseus'un yedisi, Oberon, Titania, Puck ve Bottom. Çoğu okulun ilk sahnelediği komedi ve genç oyuncular için kullanışlı kısa konuşmanın en çok olduğu oyun. Kamu malı, eksiksiz basılı.",
    },
    "twelfth-night-monologues": {
      title: "Twelfth Night monologları: her konuşma, tam metin",
      em: "Twelfth Night",
      h1: "{em} monologları, tam metin",
      direction: "(ya da ne dilersen.)",
      intro:
        "Viola, mektubuyla Malvolio, yanlış ikize tutulan Olivia, müzik üzerine Dük ve her şey üzerine Soytarı. Shakespeare'de kadınlar için en iyi komik monologlardan bazıları ve son sözü soytarının söylediği tek oyun.",
    },
    "much-ado-about-nothing-monologues": {
      title: "Much Ado About Nothing monologları: tam metin",
      em: "Much Ado About Nothing",
      h1: "{em} monologları, tam metin",
      direction: "(messina.)",
      intro:
        "Benedick'in sekizi, Beatrice'in beşi, Dogberry'nin altısı, düğündeki Leonato, Don Pedro, Borachio ve Don John. Shakespeare'in en keskin komik konuşmaları ve hiç de komik olmayan birkaç tane. Kamu malı, eksiksiz basılı.",
    },
    "a-dolls-house-monologues": {
      title: "A Doll's House monologları: Nora, Torvald ve Krogstad",
      em: "A Doll's House",
      h1: "{em} monologları, tam metin",
      direction: "(kapı.)",
      intro:
        "Nora'nın son sahnesi kadınlar için en çok istenen modern klasik parça ve burada eksiksiz, ona giden her şeyle birlikte: Helmer'in on beş konuşması, Krogstad'ın üçü. Çeviri kamu malı, bu yüzden her konuşma tam metin basılı.",
    },
    "julius-caesar-monologues": {
      title: "Julius Caesar monologları: Brutus, Antony, Cassius ve Portia",
      em: "Julius Caesar",
      h1: "{em} monologları, tam metin",
      direction: "(mart'ın ortası.)",
      intro:
        "Cesedin başında Antony, bahçede Brutus, Tiber üzerine Cassius, kendisine anlatılmasını isteyen Portia. Dildeki en iyi siyasi retoriğe sahip oyundan kırk dört konuşma; kamu malı, eksiksiz basılı ve zamanlanmış.",
    },
    "medea-monologues": {
      title: "Medea monologları: her konuşma, tam metin",
      em: "Medea",
      h1: "{em} monologları, tam metin",
      direction: "(korint.)",
      intro:
        "Medea'nın yirmi iki konuşması, Jason'ın onu, Dadı, Creon, Aegeus ve Ulak. Sahnenin tamamını bir kadına veren ve salona gözünü kaçırmaya cesaret edip edemeyeceğini soran oyun. Kamu malı, eksiksiz basılı.",
    },
    "euphoria-monologues": {
      title: "Euphoria monologları: Rue, Jules, Ali, Maddy, Nate ve Cal",
      em: "Euphoria",
      h1: "{em} monologları, karaktere göre",
      direction: "(east highland.)",
      intro:
        "Rue'nun onu, Jules'un sekizi, Ali'nin on biri ve yanlarında Maddy, Cal, Nate ve Leslie. Euphoria, ActorRise'da en çok aranan dizilerden biri ve insanların geldiği konuşmalar bunlar, karaktere göre listelendi. Metin telifli; bu yüzden her kayıt parçayı adlandırıyor, gerisini arama açıyor.",
    },
    "yellowjackets-monologues": {
      title: "Yellowjackets monologları: Shauna, Misty, Natalie ve Jackie",
      em: "Yellowjackets",
      h1: "{em} monologları, karaktere göre",
      direction: "(vahşi doğa.)",
      intro: `İnsanların aradığı Shauna ve burada; yanında Misty, Natalie, Jackie ve Koç Ben ile. Dizi telifli; bu yüzden her kayıtta karakter, parça ve süre yazıyor, gerisini arama açıyor.`,
    },
    "monologues-about-love": {
      title: "Aşk üzerine monologlar",
      em: "monologlar",
      h1: "Aşk üzerine {em}",
      direction: "(en eski konu.)",
      intro:
        "Ona düşmek, ondan geri çevrilmek, onu kaybetmek, istemiyormuş gibi yapmak. Arşivde dört bin parça aşk etiketi taşıyor; bunlar tek başına en iyi okunan otuzu, kamu malı olanlar eksiksiz basılı.",
    },
    "love-monologues-that-turn-hopeful": {
      title: "Umuda dönen aşk monologları, 1 ile 1½ dakika",
      em: "aşk",
      h1: "Umuda dönen {em} monologları, bir ile bir buçuk dakika arası",
      direction: "(önce hüzün, sonra umut.)",
      intro:
        "Bu, dönem sonu sınavı listesi: hüzünlü bir yerden başlayıp umutla biten, bir ile bir buçuk dakikalık bir aşk monoloğu. Her biri bu dönüş için okundu ve altındaki satır dönüşün nerede olduğunu söylüyor; böylece hangi âna doğru inşa ettiğini bilirsin. Seçmeden önce birkaçını sesli oku; doğru olan genelde sana benzer.",
      picks: {
        "25980": "Onu karşılığında hiçbir şey almadan sevebileceğini kabul ettiğinde döner",
        "12658": "Artık kendi başına nefes alma vaktinin geldiğini söylediğinde döner",
        "18802": "Aklını daha yükseğe taşımaya ant içtiğinde döner",
        "27270": "Jason'ın onların hayatlarına devam etmesini isteyeceğini söylediğinde döner",
        "19142": "Kendini kandırdığını ve koşa koşa geri geldiğini itiraf ettiğinde döner",
        "25398": "Onun hatalarının kendi sevgisinden büyük olmadığına karar verdiğinde döner",
        "26145": "Onun için savaşması gerektiğini söylediğinde döner",
        "19403": "Annesinin sevgiden ötürü gittiğini anladığında döner",
        "26745": "Onu kaybetmekten korkmayı bırakıp yerine ona teşekkür ettiğinde döner",
        "39663": "Bir daha asla ayrı düşmeyeceklerine ant içtiğinde döner",
        "11626": "Miles'a onda bir kıvılcım gördüğünü söylediğinde döner",
        "26381": "Annesiyle babasının hikâyesi olduğunu hatırladığında döner",
        "34469": "Ona veremeyeceklerini saymayı bırakıp sevgisini sunduğunda döner",
        "28903": "Ona yeniden bakıp hayranlığın korkuyu yendiği anda döner",
        "31636": "Ona sarılmasına izin verebileceğini düşünmeye kendini bıraktığında döner",
        "22938": "Sofrada Mikey'nin yerini hazırlayıp onun iyi olduğunu bildiğinde döner",
        "25953": "Ona inanmayı seçtiğinde döner",
        "18913": "Arkadaşının sevdiği insanları sevmeye karar verdiğinde döner",
        "6089": "Onun şeytan değil melek olduğuna karar verdiğinde döner",
        "30414": "Onun kötü talihinin yaptıklarının bedelini ödediğine karar verdiğinde döner",
        "20937": "Babasının hâlâ onun bir parçası olduğunu fark ettiğinde döner",
        "26507": "Marion'a hayatta gözümüzün gördüğünden fazlası olduğunu söylediğinde döner",
        "30797": "Karanlıkta onun sesini duyup peşinden gittiğinde döner",
        "39354": "Kederden bile huzur filizlenebileceğini söylediğinde döner",
        "22910": "Ona oğlum demekten gurur duyacağını söylediğinde döner",
        "37728": "Sadık kalmak için bulduğu gücü hatırladığında döner",
        "35818": "Ona gerçeği anlatmak için ömrünün geri kalanını istediğinde döner",
        "11902": "Oğullarına birbirlerini sevmeleri için yalvardığında döner",
        "31365": "Aptal olanın kendisi olmasına sevindiğine karar verdiğinde döner",
        "5366": "Mektubunun erkek kardeşine ulaşacağını ummaya cesaret ettiğinde döner",
        "40409": "Prens onu yanına çağırdığında ve o diz çöktüğünde döner",
        "36641": "Kendini iyileştirmeye karar verdiğinde döner",
        "21784": "Bunu atlattığını ve Connie'nin babasıyla tanıştığını söylediğinde döner",
      },
    },
    "monologues-about-revenge": {
      title: "İntikam üzerine monologlar",
      em: "monologlar",
      h1: "İntikam üzerine {em}",
      direction: "(soğuk servis edilir.)",
      intro:
        "Birinin bu konuda ne yapacağına karar verdiği konuşma. Arşivde bin üç yüz parça intikam etiketi taşıyor, klasik ve modern; aşağıdaki otuzu tek başına en iyi okunanlar, kamu malı olanlar eksiksiz basılı.",
    },
    "monologues-about-jealousy": {
      title: "Kıskançlık üzerine monologlar",
      em: "monologlar",
      h1: "Kıskançlık üzerine {em}",
      direction: "(yeşil gözlü canavar.)",
      intro:
        "Arşivde altı yüz parça kıskançlık etiketi taşıyor ve çoğu Shakespeare değil. Şüphe, haset, rolü kapan arkadaş. Aşağıdaki otuzu tek başına en iyi okunanlar; kamu malı olanlar eksiksiz basılı.",
    },
    "monologues-about-grief": {
      title: "Yas ve kayıp üzerine monologlar",
      em: "monologlar",
      h1: "Yas ve kayıp üzerine {em}",
      direction: "(geriye kalan.)",
      intro:
        "Bir ölüm, bir gidiş, geri alınamayacak şey. İyi oynanması en zor parçalar ve dramatik bir slotta en sık istenenler. Arşivde yas ya da kayıp olarak etiketlendi; kamu malı olanlar tam metin basılı.",
    },
    "comedic-monologues-for-teens": {
      title: "Gençler için komik monologlar",
      em: "komik",
      h1: "Gençler için {em} monologlar",
      direction: "(komik, ve senin yaşında.)",
      intro:
        "Genç karakterler için komik parçalar; her drama öğretmeninin ve cuma günü seçmesi olan her on beş yaşındakinin aradığı raf. Klasik de var modern da; kamu malı olanlar eksiksiz basılı.",
    },
    "dramatic-monologues-for-teens": {
      title: "Gençler için dramatik monologlar",
      em: "dramatik",
      h1: "Gençler için {em} monologlar",
      direction: "(ciddi, ve senin yaşında.)",
      intro:
        "Genç karakterler için ciddi parçalar; bir yetişkinin konuşmasından kısaltılmamış, o yaşta yazılmış. Arşivde iki yüzden fazla var; bunlar tek başına en iyi okunanlar, kamu malı olanlar tam metin basılı.",
    },
    "villain-monologues": {
      title: "Kötü karakter monologları",
      em: "Kötü karakter",
      h1: "{em} monologları",
      direction: "(en iyi replikler.)",
      intro:
        "En iyi konuşmalar kötü karakterindir ve bunu bilir. Iago, Richard ve Edmund kalıbı koydu; aşağıdaki film ve televizyon kötüleri onlardan öğrendi. Tonu karanlık, her dönemden, tek başına ne kadar iyi durduklarına göre listelendi.",
    },
    "midnight-mass-monologues": {
      title: "Midnight Mass monologları: Father Paul, Bev, Erin ve Riley",
      em: "Midnight Mass",
      h1: "{em} monologları, karaktere göre",
      direction: "(crockett adası.)",
      intro: `Diziden elli yedi konuşma; ActorRise'daki diziler arasında en çok konuşma bunda. Father Paul'ün on altısı, Bev'in on ikisi, Erin'in on biri ve Riley'nin dokuzu, yanlarında Leeza ve Mildred ile. ${COPYRIGHT_TAIL}`,
    },
    "breaking-bad-monologues": {
      title: "Breaking Bad monologları: Jesse, Walt, Saul ve Skyler",
      em: "Breaking Bad",
      h1: "{em} monologları, karaktere göre",
      direction: "(albuquerque.)",
      intro: `Yirmi beş konuşma. Jesse'nin altısı ve Walt'ın beşi, ardından Saul, Skyler, Mike, Gale ve Hank, bir de tek sahnesi olup onu değerlendiren birkaç kişiden. ${COPYRIGHT_TAIL}`,
    },
    "succession-monologues": {
      title: "Succession monologları: Shiv, Roman, Kendall ve Tom",
      em: "Succession",
      h1: "{em} monologları, karaktere göre",
      direction: "(roy ailesi.)",
      intro: `Roy ailesinden ve çevresindekilerden on altı konuşma. Shiv'in dördü ve Roman'ın dördü, Kendall'ın üçü, bir de Tom, Caroline, Frank ve Karolina. ${COPYRIGHT_TAIL}`,
    },
    "ted-lasso-monologues": {
      title: "Ted Lasso monologları: Ted, Rebecca, Roy ve Nate",
      em: "Ted Lasso",
      h1: "{em} monologları, karaktere göre",
      direction: "(richmond.)",
      intro: `On altı konuşma. Ted'in altısı, Rebecca'nın üçü, bir de Roy, Nate, Higgins ve Trent. Bir anda yön değiştiren komedi; pek çok seçmenin istediği de tam olarak bu. ${COPYRIGHT_TAIL}`,
    },
    "bridgerton-monologues": {
      title: "Bridgerton monologları: Daphne, Kate, Violet ve Eloise",
      em: "Bridgerton",
      h1: "{em} monologları, karaktere göre",
      direction: "(mayfair, sezon.)",
      intro: `On beş konuşma. Daphne'nin dördü, Kate'in üçü, Violet'in ikisi, bir de Eloise, Penelope, Lady Danbury, Lady Featherington ve Anthony. ${COPYRIGHT_TAIL}`,
    },
    "black-mirror-monologues": {
      title: "Black Mirror monologları: Bing, Walton ve Judge Hope",
      em: "Black Mirror",
      h1: "{em} monologları, karaktere göre",
      direction: "(bir ekran, bir yerde.)",
      intro: `Antolojinin genelinden on beş konuşma. Bing'in Fifteen Million Merits'teki dördünün hepsi, Walton'ın dördü, Judge Hope'un üçü, bir de Jonas, Max, Rod ve Captain Daly. ${COPYRIGHT_TAIL}`,
    },
    "big-little-lies-monologues": {
      title: "Big Little Lies monologları: Madeline, Jane, Celeste ve Renata",
      em: "Big Little Lies",
      h1: "{em} monologları, karaktere göre",
      direction: "(monterey.)",
      intro: `Yirmi yedi konuşma. Madeline'in yedisi ve Jane'in yedisi, Ed'in üçü, Celeste'in ikisi ve diğerlerinin arasında Renata. ${COPYRIGHT_TAIL}`,
    },
    "yellowstone-monologues": {
      title: "Yellowstone monologları: John Dutton, Jamie ve Rainwater",
      em: "Yellowstone",
      h1: "{em} monologları, karaktere göre",
      direction: "(çiftlik.)",
      intro: `On beş konuşma. John Dutton'ın dördü, Jamie'nin ikisi, Rainwater'ın ikisi, Senator Perry'nin ikisi, bir de Pastor Bob, Sarah Atwood ve Red Bear. ${COPYRIGHT_TAIL}`,
    },
    "community-monologues": {
      title: "Community monologları: Abed, Jeff, Britta ve Annie",
      em: "Community",
      h1: "{em} monologları, karaktere göre",
      direction: "(greendale.)",
      intro: `On dört konuşma. Abed'in dördü, Jeff'in üçü, Britta'nın ikisi, bir de Annie, Shirley, Duncan ve Dean Pelton. ${COPYRIGHT_TAIL}`,
    },
    "chernobyl-monologues": {
      title: "Chernobyl monologları: Legasov, Shcherbina ve Khomyuk",
      em: "Chernobyl",
      h1: "{em} monologları, karaktere göre",
      direction: "(pripyat, 1986.)",
      intro: `On dört konuşma. Legasov'un yedisi, Shcherbina'nın üçü, Khomyuk'un ikisi, bir de Bacho ve Charkov. ${COPYRIGHT_TAIL}`,
    },
    "true-detective-monologues": {
      title: "True Detective monologları: Rust Cohle ve Marty Hart",
      em: "True Detective",
      h1: "{em} monologları, karaktere göre",
      direction: "(louisiana.)",
      intro: `Yirmi bir konuşma. On üçü Rust Cohle'un; yanında Marty Hart'ın beşi ve Danvers'ın ikisi. ${COPYRIGHT_TAIL}`,
    },
    "the-night-manager-monologues": {
      title: "The Night Manager monologları: Burr, Roper, Corkoran ve Pine",
      em: "The Night Manager",
      h1: "{em} monologları, karaktere göre",
      direction: "(kahire'de bir otel.)",
      intro: `Otuz beş konuşma. Burr'ün on ikisi, Roper'ın yedisi, Corkoran'ın dördü ve Pine'ın üçü; yanlarında Jed, Sophie ve Steadman. ${COPYRIGHT_TAIL}`,
    },
    "severance-monologues": {
      title: "Severance monologları: Cobel ve Mark",
      em: "Severance",
      h1: "{em} monologları, karaktere göre",
      direction: "(ayrılmış kat.)",
      intro: `Dokuz konuşma. Cobel'in dördü ve katın iki tarafından da Mark. ${COPYRIGHT_TAIL}`,
    },
    "barry-monologues": {
      title: "Barry monologları: Barry, Sally, Cousineau ve Noho Hank",
      em: "Barry",
      h1: "{em} monologları, karaktere göre",
      direction: "(los angeles'ta bir oyunculuk dersi.)",
      intro: `Bir oyunculuk dersini anlatan diziden dokuz konuşma. Barry'nin üçü, bir de Sally, Cousineau, Fuches, Noho Hank, Chris ve Ryan. ${COPYRIGHT_TAIL}`,
    },
    "ozark-monologues": {
      title: "Ozark monologları: Marty, Del ve Bruce",
      em: "Ozark",
      h1: "{em} monologları, karaktere göre",
      direction: "(göl.)",
      intro: `On bir konuşma. Bruce'un dördü, Marty'nin üçü ve Del'in üçü, bir de Bob Evans. ${COPYRIGHT_TAIL}`,
    },
    "a-few-good-men-monologues": {
      title: "A Few Good Men monologları: Jessep, Kaffee ve Jo",
      em: "A Few Good Men",
      h1: "{em} monologları, karaktere göre",
      direction: "(mahkeme salonu.)",
      intro: `Dokuz konuşma. Beşi Colonel Jessep'in; yanında Kaffee, Jo, Dawson ve Ross. ${COPYRIGHT_TAIL}`,
    },
    "pulp-fiction-monologues": {
      title: "Pulp Fiction monologları: Jules, Butch ve the Wolf",
      em: "Pulp Fiction",
      h1: "{em} monologları, karaktere göre",
      direction: "(los angeles.)",
      intro: `Sekiz konuşma. Jules'un üçü, bir de Butch, Captain Koons, Jimmie, Marsellus ve the Wolf. ${COPYRIGHT_TAIL}`,
    },
    "the-wolf-of-wall-street-monologues": {
      title: "The Wolf of Wall Street monologları: Jordan Belfort",
      em: "The Wolf of Wall Street",
      h1: "{em} monologları, karaktere göre",
      direction: "(borsa salonu.)",
      intro: `On konuşma. Dokuzu Jordan Belfort'un, biri Mark Hanna'nın. ${COPYRIGHT_TAIL}`,
    },
  },

  contentLegal: {
    trNotice: "Bu çeviri bilgilendirme amaçlıdır. Bağlayıcı olan metin İngilizce sürümdür.",
    backHome: "Ana sayfaya dön",
    contactPage: "İletişim sayfası",
  },

  contentBlog: {
    direction: "(kulisten.)",
    title: "Blog",
    lede:
      "Oyuncular için monolog seçme, seçmelere hazırlanma ve daha akıllıca prova etme üzerine pratik yazılar. Bir pazarlama ekibi değil, bir oyuncu yazıyor.",
    meta: "{date} · {minutes} dk okuma",
    readMore: "Devamını oku",
    posts: {
      "most-overdone-audition-monologues": {
        title: "En çok oynanan seçme monologları (ve yerine ne getirmeli)",
        excerpt:
          "Seçmecilerin her bekleme salonunda duyduğu monologlar, çok oynanan Shakespeare parçaları dahil; seninkinin onlardan biri olup olmadığını nasıl anlarsın ve sana yine de uyan daha taze bir şeyi nasıl bulursun.",
      },
    },
  },

  contentOverdone: {
    direction: "(klişe uyarısı.)",
    title: "En {em} seçme monologları (ve bunun yerine ne yapmalı)",
    titleEm: "çok oynanan",
    meta: "{date} · {minutes} dk okuma · yazan: Canberk",
    p1:
      "Ben bir oyuncuyum ve aynı monologları tekrar tekrar duyacak kadar çok seçme bekleme salonunda oturdum. Karşı repliği okuyan kişi ilk satırı tanıdığında odanın biraz söndüğünü neredeyse hissedersin. Bu kesin bir sıralama değil. Benim ve pek çok seçmecinin durmadan duyduğu parçalar, bunların neden sessizce aleyhine çalışabildiği ve ben olsam yerine ne yapardım, hepsi bu.",
    h2Why: "Çok oynanan bir monolog neden aleyhine çalışır",
    whyBody:
      "İyi oynanan harika bir monolog asla sorun değildir. Sorun kıyaslamadır. Seçmeciler bir konuşmayı elli kez duymuşsa senin seçimlerinle ilk kez karşılaşmazlar, seni zaten bildikleri her versiyonla ölçerler. Doksan saniyeni sadece iyi olmak yerine o çukurdan çıkmaya harcarsın. Daha az bilinen bir parça, malzemeyi değil seni izlemelerini sağlar.",
    h2Tell: "Monoloğunun çok oynanıp oynanmadığını nasıl anlarsın",
    tell1: "Herkesin okuduğu bir oyunun en ünlü beş konuşmasından biri.",
    tell2: "İnsanların alıntıladığı bir film ya da dizi sahnesi olarak viral oldu.",
    tell3: "Öğretmenin onu sınıfın yarısına verdi.",
    tell4: "Sana uyduğu için değil, “klasik” olduğu için seçtin.",
    tellAfter: "Bunların hiçbiri bir parçayı kötü yapmaz. Sadece odaya kalabalık girdiğin anlamına gelir.",
    h2Classical: "Her bekleme salonunda duyacağın klasik parçalar",
    classicalIntro:
      "En çok tekrar edilenler Shakespeare ve klasikler; kısmen zorunlu oldukları, kısmen de ücretsiz oldukları için. Sık sık çok oynanan diye anılanlar:",
    classical1: "Hamlet'ten “To be or not to be”",
    classical2: "Macbeth'ten “Tomorrow, and tomorrow, and tomorrow”",
    classical3: "Henry V'ten St. Crispin Günü konuşması",
    classical4: "A Midsummer Night’s Dream'den Puck'ın kapanış konuşması",
    classical5: "Juliet'in “Gallop apace” konuşması ve balkon konuşmaları",
    classical6: "Lady Macbeth'in “Out, damned spot” konuşması",
    classicalAfter: "Hepsi olağanüstü. Hepsi durmadan duyuluyor.",
    h2Screen: "Herkesin ezberlediği film ve dizi monologları",
    screenIntro:
      "Ekran monologları, herkesin aynı filmleri izlediğini hatırlayana kadar taze gelir. Tekrar tekrar karşına çıkanlar:",
    screen1: "A Few Good Men'den “You can’t handle the truth”",
    screen2: "Pulp Fiction'dan Ezekiel 25:17 konuşması",
    screen3: "Good Will Hunting'den park bankı konuşması",
    screen4: "Wall Street'ten “Greed is good”",
    screen5: "Glengarry Glen Ross'tan “always be closing” konuşması",
    screenAfter: "Harika yazılmışlar, ama seçmeciler onları yüz tane self-tape'te duydu.",
    h2Instead: "Bunun yerine ne yapmalı",
    insteadIntro:
      "Taze olmak, sırf olsun diye bilinmedik olmak değildir. Sana uyan ve seçmecilerin seni gerçekten görmesini sağlayan bir şeyle odaya girmektir. İşe yarayan birkaç şey:",
    tip1Title: "Çok oynananlar filtresini kullan.",
    tip1Body:
      "ActorRise sürekli kullanılan parçaları işaretler, böylece onları bilerek atlayabilirsin. {link} ile başla.",
    tip1Link: "Monolog bulucu",
    tip2Title: "Ünlü olana değil, sana uyana göre ara.",
    tip2Body:
      "Tipini, tonunu ve süreni anlat; arama sana bir “en iyiler” listesini karıştırırken asla bulamayacağın parçaları getirsin.",
    tip3Title: "Bir adım daha az ünlüsüne git.",
    tip3Body: "Aynı oyun yazarının genelde kimsenin getirmediği üç konuşması daha vardır.",
    tip4Title: "Senin olana kadar prova et.",
    tip4Body: "Parça ezber gibi değil yaşanmış gibi gelsin diye onu {link} ile sesli çalış.",
    outro:
      "Sana yakışan bir şey seç ve onu dürüstçe oyna; o zaman herkesin ne getirdiği neredeyse önemsizleşir. Bütün oyun bu.",
    ctaFind: "Taze bir monolog bul",
  },

  contentGuides: {
    direction: "(yönetmenin notları.)",
    title: "{em} için rehberler ve eğitimler.",
    titleEm: "Oyuncular",
    lede:
      "ActorRise'dan en iyi şekilde yararlanmak üzerine kısa videolar: doğru monoloğu bulmaktan ScenePartner ile prova etmeye kadar. Yenileri yolda.",
    tryIt: "Kendin denemeye hazır mısın? {finder} ile başla ya da {partner} ile prova et.",
    finderLink: "monolog bulucu",
    play: "{title} videosunu oynat",
    thumbnail: "{title} küçük resmi",
    videos: {
      TTZxo3bZPI4: {
        title: "ScenePartner nasıl çalışır",
        description:
          "Diğer replikleri ScenePartner okurken bir sahneyi prova etmeye kısa bir bakış; böylece partner ayarlamadan, istediğin zaman metni sesli çalışabilirsin.",
      },
    },
  },

  contentPrivacy: {
    direction: "(küçük harflerle yazılanlar.)",
    title: "Gizlilik Politikası",
    updated: "Son güncelleme: 29 Ekim 2026",
    s1Title: "1. Giriş",
    s1Body:
      "ActorRise (“biz” veya “bizim”), actorrise.com adresindeki web sitesini ve platformu ve iOS için Ghost Light: Monologues dahil mobil uygulamalarımızı (birlikte “Hizmet”) işletir. Bu Gizlilik Politikası, Hizmetimizi kullandığında bilgilerini nasıl topladığımızı, kullandığımızı, paylaştığımızı ve koruduğumuzu açıklar. Hizmete erişerek veya Hizmeti kullanarak bu Gizlilik Politikasını kabul etmiş olursun. Kabul etmiyorsan lütfen Hizmeti kullanma.",
    s2Title: "2. Topladığımız Bilgiler",
    s2Intro: "Doğrudan bize verdiğin bilgileri ve otomatik olarak edindiğimiz bilgileri toplarız:",
    s2AccountLabel: "Hesap bilgileri:",
    s2Account:
      "Kaydolduğunda (e-posta ile ya da Google veya Apple gibi üçüncü taraf girişiyle) e-posta adresini ve verdiysen adını alırız. Üçüncü taraf girişi kullandığında şifreni saklamayız.",
    s2ProfileLabel: "Profil bilgileri:",
    s2Profile:
      "Önerileri ve özellikleri kişiselleştirmek için ad, yaş aralığı, cinsiyet, etnik köken, boy, vücut yapısı, konum, deneyim düzeyi, oyuncu tipi, eğitim geçmişi, sendika durumu, tercih ettiğin türler ve benzeri bilgileri vermeyi seçebilirsin.",
    s2HeadshotLabel: "Vesikalık ve görseller:",
    s2Headshot:
      "Bir vesikalık veya başka görseller yüklersen, Hizmeti sunmak için (ör. profilinde göstermek) bunları saklar ve işleriz.",
    s2UsageLabel: "Kullanım ve tercihler:",
    s2Usage:
      "Hizmeti işletmek, geliştirmek ve kişiselleştirmek için Hizmeti nasıl kullandığına dair veriler (ör. aramalar, kaydedilenler, özellik kullanımı) toplarız.",
    s2PaymentLabel: "Ödeme bilgileri:",
    s2Payment:
      "Web üzerinden abone olursan ödeme, ödeme sağlayıcımız (ör. Stripe) tarafından işlenir. iOS uygulamamızın içinden abone olursan ödeme, Apple tarafından uygulama içi satın alma yoluyla işlenir. Her iki durumda da kartının tam numarasını saklamayız; yalnızca faturalandırma ve destek için gerekenleri (ör. son dört hane veya bir makbuz kimliği ve fatura e-postası) alır ve saklarız.",
    s2TechLabel: "Teknik ve cihaz verileri:",
    s2Tech:
      "Güvenlik, dolandırıcılığın önlenmesi ve analiz için IP adresi, tarayıcı türü, cihaz türü ve benzeri teknik verileri toplayabiliriz.",
    s3Title: "3. Bilgilerini Nasıl Kullanırız",
    s3Intro: "Topladığımız bilgileri şu amaçlarla kullanırız:",
    s3i1: "Hizmeti sunmak, sürdürmek ve geliştirmek.",
    s3i2: "Kimliğini doğrulamak ve hesabını yönetmek.",
    s3i3: "İçeriği ve önerileri kişiselleştirmek (ör. monolog eşleşmeleri, yapay zekâ tabanlı özellikler).",
    s3i4: "Ödemeleri işlemek ve abonelikleri yönetmek.",
    s3i5: "Sana hizmetle ilgili bildirimler göndermek (ör. hesap veya fatura bildirimleri).",
    s3i6: "Taleplerini ve destek sorularını yanıtlamak.",
    s3i7: "Dolandırıcılığı, kötüye kullanımı veya güvenlik sorunlarını tespit etmek, önlemek ve gidermek.",
    s3i8: "Yasal yükümlülüklere uymak ve Hizmet Koşullarımızı uygulamak.",
    s3i9: "Hizmeti geliştirmek için kullanımı analiz etmek (toplulaştırılmış veya anonimleştirilmiş veriler yoluyla da).",
    s4Title: "4. İşlemenin Hukuki Dayanağı (AEA/Birleşik Krallık)",
    s4Body:
      "Veri koruma mevzuatı (ör. GDPR) kapsamında uygulanabilir olduğu durumlarda verilerini şu dayanaklarla işleriz: (a) seninle yaptığımız sözleşmenin ifası (Hizmetin sunulması); (b) talep ettiğimiz durumlarda rızan (ör. pazarlama); (c) meşru menfaatlerimiz (ör. güvenlik, analiz, Hizmetin geliştirilmesi); ve (d) yasal yükümlülüklere uyum.",
    s5Title: "5. Üçüncü Taraf Hizmetler ve Paylaşım",
    s5Intro:
      "Hizmeti işletmek için güvenilir üçüncü taraflardan yararlanırız. Bu taraflar, sıkı sözleşmeler çerçevesinde verilerini bizim adımıza işleyebilir:",
    s5AuthLabel: "Kimlik doğrulama ve depolama:",
    s5Auth: "Supabase (kimlik doğrulama ve bulut depolama). İşledikleri veriler için kendi gizlilik uygulamaları geçerlidir.",
    s5SignInLabel: "Giriş sağlayıcıları:",
    s5SignIn:
      "Google veya Apple ile giriş yaparsan bu sağlayıcılar, kendi politikaları doğrultusunda paylaşılmasına onay verdiğin bilgileri (ör. e-posta, ad) bizimle paylaşır.",
    s5WebPayLabel: "Web üzerinden ödemeler:",
    s5WebPay:
      "actorrise.com üzerinden alınan abonelikler için Stripe veya başka bir ödeme işlemcisi. Ödeme verilerini onlar işler; ödeme kartının tam bilgilerini saklamayız.",
    s5IosPayLabel: "iOS uygulamamızdaki ödemeler:",
    s5IosPay:
      "Ghost Light: Monologues içinden alınan abonelikler, Apple tarafından uygulama içi satın alma yoluyla işlenir. Apple ödeme bilgilerini bizimle paylaşmaz. Hangi aboneliğe sahip olduğunu kaydetmek ve bunu cihazların arasında eşit tutmak için RevenueCat kullanırız; RevenueCat, hesabın için takma adlı bir tanımlayıcıyı, satın alma ve makbuz geçmişini, temel cihaz ve uygulama sürümü verilerini alır. Kart numaran hiçbir zaman bize ulaşmaz.",
    s5AiLabel: "Yapay zekâ sağlayıcıları:",
    s5Ai:
      "Arama, öneriler, konuşmanın metne dökülmesi, self-tape geri bildirimi ve senaryo ayrıştırma için OpenAI kullanırız. Sahne partnerinin sesi, senaryo metninden OpenAI, Google (Gemini ve Vertex AI) veya Inworld tarafından üretilir; bu sağlayıcılar senin kim olduğunu değil, seslendirilecek replikleri alır. Neyin gönderildiğini ve neyin saklandığını 6. bölüm tam olarak anlatır. Bu sağlayıcıların API koşulları uyarınca, API'leri üzerinden gönderilen içerik modellerini eğitmek için kullanılmaz.",
    s5CueLabel: "Cue, uygulama içi asistan:",
    s5Cue:
      "Cue'ya yazdıkların, Cue'nun yanıtını yazması için Anthropic'e gönderilir; bu, o içerikle model eğitilmesine izin vermeyen API koşulları altında olur. Cue ile yaptığın konuşmalar hesabında saklanır ve Cue bir soruyu Canberk'e ilettiğinde Canberk bu konuşmaları okur. Bize e-postayla yazmayacağın hiçbir şeyi Cue'ya yazma.",
    s5WebAnalyticsLabel: "Web sitesi analizi:",
    s5WebAnalytics:
      "actorrise.com, ziyaretleri, görüntülenen sayfaları ve hangi özelliklerin kullanıldığını takma adlı bir tanımlayıcıyla saymak için Google Analytics kullanır. Google Analytics e-posta adresini veya aradığın kelimeleri almaz.",
    s5AppAnalyticsLabel: "iOS uygulamamızda ürün analizi:",
    s5AppAnalyticsA:
      "Ghost Light: Monologues, uygulamanın hangi bölümlerinin işe yaradığını ve insanların nerede takıldığını görebilmemiz için PostHog kullanır. PostHog, ne olduğunu anlatan olayları (bir arama yapıldığını, bir monoloğun açıldığını, abonelik ekranının göründüğünü) takma adlı bir tanımlayıcı, cihaz türün ve uygulama sürümüyle birlikte alır.",
    s5AppAnalyticsB: "Aradığın kelimeleri almaz, okuduğun monologları da almaz.",
    s5AppAnalyticsC:
      "Giriş yaparsan bu olaylar hesap tanımlayıcınla ilişkilendirilir, e-posta adresinle asla ilişkilendirilmez.",
    s5FeedLabel: "Topluluk akışı (Duyuru Panosu).",
    s5Feed:
      "ActorRise, giriş yapmış diğer kullanıcıların görebildiği bir topluluk etkinlik akışı içerir. Bu akışta adın, şehrin ve profil fotoğrafın; katılma, belirli bir monoloğu okuma, kaydetme veya prova etme gibi etkinliklerle birlikte görünebilir. Aramalarının metni asla görünmez: ham arama sorguları akışta hiç saklanmaz ve bir arama yalnızca genel bir açıklama olarak görünür (örneğin “komik bir monolog aradı”). Bunu istediğin zaman Duyuru Panosu'ndaki “Etkinliğimi gizle” seçeneğiyle kapatabilirsin; bu yalnızca gelecekteki değil, geçmişteki etkinliğini de gizler. Akışın oturum açmamış ziyaretçilere gösterilen önizlemesinde yalnızca adının baş harfi görünür, fotoğraf görünmez.",
    s5NoSell:
      "Kişisel bilgilerini satmayız. Kanunen gerekli olduğunda, haklarımızı veya güvenliğimizi korumak için ya da bir birleşme, satış veya varlık devri kapsamında (gerektiğinde bildirimde bulunarak) bilgilerini açıklayabiliriz.",
    s6Title: "6. Ses, Video ve Senaryo İçeriği",
    s6Intro:
      "Bazı özellikler, kaydettiğin veya yüklediğin şeyi yapay zekâ sağlayıcımıza göndererek çalışır. Bu bölüm cihazından tam olarak neyin çıktığını, nereye gittiğini ve neyin saklandığını açıklar. Bu özellikleri hiç kullanmazsan bunların hiçbiri seni ilgilendirmez.",
    s6VoiceLabel: "Prova sırasında sesin.",
    s6Voice:
      "Bir sahneyi veya monoloğu prova edip repliklerini söylediğinde, tarayıcın veya uygulama kısa ses kayıtları alır ve bunlar metne dönüştürülmek üzere transkripsiyon sağlayıcımıza (OpenAI Whisper) gönderilir; böylece sahne partneri bir repliği ne zaman bitirdiğini bilir. Metin geri gelir gelmez ses dosyası silinir. Kayıtlarını saklamayız, veritabanımızda tutmayız ve ActorRise'da kimse onları dinlemez.",
    s6PartnerLabel: "Sahne partnerinin sesi.",
    s6Partner:
      "Diğer karakterin replikleri, sağlayıcımızın senaryo metninden ürettiği sentetik bir sesle okunur. Bu, bir insanın kaydı değil, üretilmiş bir sestir.",
    s6VideoLabel: "Self-tape videosu.",
    s6Video:
      "Seçme Modu'nda (Audition Mode) videon kaydedilir ve cihazında kalır. Cihazın az sayıda durağan kare çıkarır ve kadraj, ışık ve performans hakkında geri bildirim üretmek için yalnızca bu kareleri yapay zekâ sağlayıcımıza gönderir. Video dosyasının kendisi asla bize yüklenmez. Geri bildirim üretildikten sonra kareler saklanmaz.",
    s6ScriptsLabel: "Yüklediğin senaryolar ve seçme metinleri.",
    s6Scripts:
      "Yüklediğin senaryolar, tekrar prova edebilmen için hesabında saklanır. Karakterleri belirlemek ve diyaloğu bölmek için metin, ayrıştırılmak üzere yapay zekâ sağlayıcımıza gönderilir. Yüklediğin senaryolar, birini paylaşmayı seçmediğin sürece yalnızca senin hesabına özeldir ve onları herkese açık monolog arşivimize eklemeyiz.",
    s6After:
      "Yapay zekâ sağlayıcımıza API'leri üzerinden gönderilen içerik, modellerini eğitmek için kullanılmaz. Sağlayıcı, API koşulları uyarınca bu içeriği kötüye kullanım takibi için kısa bir süre saklayabilir. Tarayıcı veya cihaz iznini vermeyerek ya da geri alarak veya bu özellikleri kullanmayarak mikrofon ve kamera işlemeyi istediğin zaman durdurabilirsin; Hizmetin geri kalanı bunlar olmadan da çalışmaya devam eder.",
    s7Title: "7. Verilerin Saklanması",
    s7Body:
      "Verilerini hesabın aktif olduğu sürece veya Hizmeti sunmak ve bu politikada açıklanan amaçları yerine getirmek için gerektiği sürece saklarız. Bazı verileri kanunen gerekli olduğunda (ör. vergi, hukuki talepler) veya meşru ticari amaçlarla (ör. güvenlik, uyuşmazlıkların çözümü) daha uzun süre saklayabiliriz. Hesap silindikten sonra, kanunen saklanması gerekenler dışında kişisel verilerini makul bir süre içinde siler veya anonimleştiririz.",
    s8Title: "8. Hakların",
    s8Intro: "Yaşadığın yere bağlı olarak şu haklara sahip olabilirsin:",
    s8AccessLabel: "Erişim",
    s8Access: "{label}: kişisel verilerine erişmek ve bir kopyasını almak.",
    s8CorrectLabel: "Düzeltme",
    s8Correct: "{label}: yanlış veya eksik verileri düzeltmek.",
    s8DeleteLabel: "Silme",
    s8Delete: "{label}: verilerini silmek (yasal istisnalar saklı kalmak kaydıyla).",
    s8RestrictLabel: "Kısıtlama veya itiraz",
    s8Restrict: "{label}: belirli işlemeleri kısıtlamak veya bunlara itiraz etmek.",
    s8PortLabel: "Veri taşınabilirliği",
    s8Port: "{label}: verilerini yapılandırılmış, makine tarafından okunabilir bir biçimde almak.",
    s8WithdrawLabel: "Rızayı geri çekme",
    s8Withdraw: "{label}: işleme rızaya dayanıyorsa rızanı geri çekmek.",
    s8ComplainLabel: "Şikâyet",
    s8Complain: "{label}: bir denetim makamına (ör. ülkendeki veya bölgendeki) şikâyette bulunmak.",
    s8After:
      "Bu hakları kullanmak için aşağıdaki e-posta adresinden bize ulaş. Sağladığımız yerlerde hesabını ve profilini Hizmet içinden güncelleyebilir veya silebilirsin.",
    s9Title: "9. Uluslararası Aktarımlar",
    s9Body:
      "Verilerin kendi ülken dışındaki ülkelerde işlenebilir. Kanunen gerekli olduğu durumlarda, verilerinin bu politikaya ve geçerli düzenlemelere uygun şekilde korunmaya devam etmesi için uygun güvenceleri (ör. standart sözleşme hükümleri, yeterlilik kararları) sağlarız.",
    s10Title: "10. Güvenlik",
    s10Body:
      "Verilerini yetkisiz erişime, kayba veya değiştirilmeye karşı korumak için teknik ve idari tedbirler uygularız. Hiçbir iletim veya depolama yöntemi %100 güvenli değildir; mutlak güvenliği garanti edemeyiz ve bu açıdan Hizmeti kullanmanın riski sana aittir.",
    s11Title: "11. Yaş",
    s11Body:
      "ActorRise 13 yaş ve üzerindeki kişiler içindir. 13 ile 17 yaş arasındaki öğrenciler ActorRise'ı okulları veya oyunculuk dersleri aracılığıyla, öğretmenleriyle birlikte kullanır. 13 yaşından küçük çocuklardan bilerek kişisel veri toplamayız. 13 yaşından küçük bir çocuğun hesabı olduğunu düşünüyorsan bize ulaş, hesabı derhal sileriz.",
    s12Title: "12. Okullar, Öğretmenler ve Öğrenciler",
    s12Intro: "Bir öğretmen bir sınıfı sınıf bağlantısıyla ActorRise'a getirdiğinde:",
    s12GivesLabel: "Bir öğrencinin bize verdikleri:",
    s12Gives:
      "kaydolurken kullandığı e-posta (genellikle okul adresi), giriş sağlayıcısı veriyorsa adı ve Hizmette yaptıkları: aramalar, kaydedilen parçalar ve provalar.",
    s12TeacherLabel: "Öğretmenin gördükleri:",
    s12TeacherA:
      "sınıfına katılan her öğrenci için öğrencinin adı, ne zaman katıldığı ve en son ne zaman aktif olduğu ve yaptıklarının sayıları (kaç arama, monolog ve sahne).",
    s12TeacherB: "Öğretmen, bir öğrencinin ne aradığını asla görmez.",
    s12OthersLabel: "Diğer kullanıcıların gördükleri:",
    s12Others: "hiçbir şey. Öğrenciler topluluk akışında asla görünmez.",
    s12EmailLabel: "E-posta:",
    s12Email:
      "sınıf bağlantısıyla katılan öğrenciler pazarlama e-postalarımızın dışında tutulur ve okul bölgesi (school district) adresi kullanan bir öğrenciye otomatik hatırlatmalar da gönderilmez. Giriş bağlantısı gibi ihtiyaç duydukları e-postaları yine de alırlar.",
    s12NoSellLabel: "Satış yok, reklam yok:",
    s12NoSell:
      "öğrenci verilerini satmayız, reklam göstermeyiz ve bu verileri Hizmeti işletmek ve geliştirmek dışında hiçbir amaçla kullanmayız.",
    s12DeleteLabel: "Silme:",
    s12Delete:
      "bir öğretmen veya okul, canberk@actorrise.com adresine e-posta göndererek öğrencilerinin hesaplarının ve verilerinin silinmesini istediği zaman isteyebilir; öğrenci de kendi hesabını Ayarlar'dan silebilir.",
    s13Title: "13. Bu Politikadaki Değişiklikler",
    s13Body:
      "Bu Gizlilik Politikasını zaman zaman güncelleyebiliriz. Güncellenmiş politikayı bu sayfada yayımlarız ve önemli değişiklikler için, kanunen gerekli olduğu durumlarda ek bildirimde bulunuruz (ör. e-posta veya ürün içi bildirim). Değişikliklerin yürürlük tarihinden sonra Hizmeti kullanmaya devam etmen, güncellenmiş politikayı kabul ettiğin anlamına gelir.",
    s14Title: "14. İletişim",
    s14Body:
      "Gizlilikle ilgili soruların, taleplerin veya şikâyetlerin için {link} üzerinden ya da orada belirtilen e-posta adresinden bize ulaş. Geçerli mevzuata uygun şekilde yanıt veririz.",
    termsLink: "Hizmet Koşulları",
  },

  contentTerms: {
    direction: "(evin kuralları.)",
    title: "Hizmet Koşulları",
    updated: "Son güncelleme: Ağustos 2026",
    s1Title: "1. Koşulların Kabulü",
    s1Body:
      "Bu Hizmet Koşulları (“Koşullar”), actorrise.com adresindeki web sitesine ve platforma, iOS için Ghost Light: Monologues dahil mobil uygulamalarımıza ve ilgili hizmetlere (birlikte “Hizmet”) erişimini ve bunları kullanımını düzenleyen, seninle ActorRise (“biz” veya “bizim”) arasında bağlayıcı bir sözleşmedir. Hesap oluşturarak, giriş yaparak veya Hizmeti başka bir şekilde kullanarak bu Koşulları ve Gizlilik Politikamızı kabul etmiş olursun. Kabul etmiyorsan Hizmeti kullanmamalısın.",
    s2Title: "2. Hizmetin Tanımı",
    s2Body:
      "ActorRise oyunculara; monolog arama ve keşfetme, profil yönetimi, yapay zekâ destekli öneriler, sahne partneri ve koçluk özellikleri ile ilgili içerik ve işlevler dahil çeşitli araçlar sunar. Özellikleri istediğimiz zaman ekleyebilir, değiştirebilir veya sonlandırabiliriz. Hizmet, bu Koşullardaki sorumluluk reddi beyanlarına ve sınırlamalara tabi olarak “olduğu gibi” sunulur.",
    s3Title: "3. Uygunluk ve Hesap",
    s3Body:
      "Hizmeti kullanmak için en az 16 yaşında (veya bulunduğun yargı alanındaki ergin olma yaşı daha yüksekse o yaşta) olmalı ve bağlayıcı bir sözleşme yapma ehliyetine sahip olmalısın. Hesap bilgilerinin gizliliğini korumaktan ve hesabın altında gerçekleşen tüm etkinliklerden sen sorumlusun. Doğru ve eksiksiz bilgi vermeli ve gerektikçe güncellemelisin. Bu Koşulları ihlal edersen veya gerekli gördüğümüz başka nedenlerle hesabını askıya alabilir ya da sonlandırabiliriz.",
    s4Title: "4. Kabul Edilebilir Kullanım",
    s4Intro: "Şunları yapmamayı kabul edersin:",
    s4i1: "Hizmeti herhangi bir yasa dışı amaçla veya geçerli yasaları ihlal edecek şekilde kullanmak.",
    s4i2: "Herhangi bir üçüncü tarafın fikri mülkiyet, gizlilik veya diğer haklarını ihlal etmek.",
    s4i3: "Karalayıcı, taciz edici, hakaret içeren, müstehcen veya başka şekilde sakıncalı içerik yüklemek veya paylaşmak.",
    s4i4: "Hizmete, diğer hesaplara veya bizim ya da sağlayıcılarımızın sistemlerine veya verilerine yetkisiz erişim sağlamaya çalışmak.",
    s4i5: "Açıkça izin verdiğimiz durumlar dışında Hizmete otomatik yollarla (ör. veri kazıyıcılar, botlar) erişmek.",
    s4i6: "Açıkça izin verdiğimiz durumlar dışında Hizmeti veya içeriği yeniden satmak, alt lisanslamak veya ticari olarak kullanmak.",
    s4i7: "Herhangi bir kullanım sınırını, güvenlik önlemini veya erişim kontrolünü aşmak.",
    s4After:
      "Bu kuralları ihlal eden içerikleri kaldırabilir, hesapları askıya alabilir veya sonlandırabiliriz. Tüm içeriği denetleme yükümlülüğümüz yoktur, ancak takdirimize bağlı olarak denetleyebiliriz.",
    s5Title: "5. Abonelikler ve Ödeme",
    s5p1:
      "Hizmetin bazı bölümleri ücretli abonelik gerektirebilir. Abone olarak satın alma sırasında belirtilen ücretleri (ör. aylık veya yıllık) ödemeyi kabul edersin. Ücretler peşin tahsil edilir ve kanunen gerekli olan veya açıkça belirttiğimiz durumlar (ör. fiyatlandırma veya ödeme sayfasındaki bir iade politikası) dışında genellikle iade edilmez. Ödeme, ödeme sağlayıcımız (ör. Stripe) tarafından işlenir; ödeme işlemine onların koşulları uygulanır. Satın alımına uygulanan vergilerden sen sorumlusun.",
    s5p2:
      "Aboneliğini sunduğumuz seçeneklere uygun şekilde (ör. hesap veya fatura ayarlarından) iptal edebilirsin. İptal, gelecekteki ödemeleri durdurur; mevcut fatura döneminin sonuna kadar erişimin devam eder. Abonelik ücretlerini makul bir bildirimle değiştirebiliriz; değişiklikten sonra kullanmaya devam etmen değişikliği kabul ettiğin anlamına gelir.",
    s5AppleTitle: "Apple üzerinden satın alınan abonelikler",
    s5p3:
      "iOS'taki Ghost Light: Monologues içinden alınan abonelikler, Stripe tarafından değil, Apple tarafından uygulama içi satın alma yoluyla satılır ve işlenir. Ödeme, satın alma onaylandığında Apple Hesabından tahsil edilir. Otomatik yenileme mevcut dönemin bitiminden en az 24 saat önce kapatılmadıkça abonelik aynı süre için aynı fiyattan otomatik olarak yenilenir ve yenileme ücreti, dönem bitmeden önceki 24 saat içinde Apple Hesabından tahsil edilir.",
    s5p4:
      "Apple aboneliğini cihazındaki Ayarlar'da, Apple Hesabın altındaki Abonelikler bölümünden yönetebilir veya iptal edebilirsin. İptal etmek gelecekteki yenilemeleri durdurur; erişimin, ödemesini zaten yaptığın dönemin sonuna kadar devam eder. Uygulamayı silmek aboneliği iptal etmez.",
    s5p5:
      "Ücretsiz deneme sunulduğunda, deneme bitmeden abonelik satın alırsan denemenin kullanılmayan kısmı hükümsüz kalır. Apple satın alımlarının iadeleri bizim tarafımızdan değil, Apple tarafından kendi koşulları çerçevesinde yürütülür; iade talebini reportaproblem.apple.com adresinden yapabilirsin.",
    s6Title: "6. Fikri Mülkiyet ve İçerik",
    s6OursLabel: "İçeriğimiz ve fikri mülkiyetimiz:",
    s6Ours:
      "Hizmet (sunduğumuz tasarım, metin, grafik, kod ve diğer materyaller dahil) ile adımız ve markamız bize veya lisans verenlerimize aittir ve telif hakkı ile diğer yasalarla korunur. Açıkça izin verdiğimiz durumlar dışında içeriğimizi veya fikri mülkiyetimizi kopyalayamaz, değiştiremez, dağıtamaz veya bunlardan türev eser oluşturamazsın.",
    s6ScriptsLabel: "Monologlar ve senaryolar:",
    s6Scripts:
      "Sunduğumuz monolog ve senaryo içerikleri, kaynak gösterilerek ve kaynağına ve ilk yayımlandığı yere bağlantı verilerek keşif amacıyla sunulur. Bu içeriği kullanman geçerli telif hakkı kurallarına ve gösterim koşullarımıza tabidir. Üçüncü taraflara ait telifli eserleri ilgili lisansın izin verdiğinin ötesinde kullanman için sana hak tanımayız; daha fazla bilgi için {link} sayfamıza bak.",
    s6SourcesLink: "Kaynaklar ve telif",
    s6FilmLabel: "Film ve televizyon referansları:",
    s6Film:
      "Film ve televizyon referans kayıtları yalnızca olgusal üst veriler (karakter adı, kaynak eserin adı, tematik açıklamalar ve bağlantılar) içerir ve telifli senaryo metni içermez. Üçüncü taraf senaryo kaynaklarına verilen bağlantılar yalnızca kolaylık amacıyla sunulur; ActorRise üçüncü taraf içeriklerinden sorumlu değildir.",
    s6YoursLabel: "Senin içeriğin:",
    s6Yours:
      "Yüklediğin içeriklerin (ör. vesikalıklar, profil metni) sahipliği sende kalır. Bu içeriği Hizmeti sunmak ve geliştirmek için gerektiği şekilde ve Gizlilik Politikamızda açıklandığı biçimde kullanmamız, saklamamız, göstermemiz ve işlememiz için bize münhasır olmayan, bedelsiz ve dünya çapında geçerli bir lisans verirsin. Bu lisansı verme hakkına sahip olduğunu ve içeriğinin bu Koşulları veya herhangi bir üçüncü taraf hakkını ihlal etmediğini beyan edersin.",
    s7Title: "7. Sorumluluk Reddi",
    s7Caps:
      "HİZMET, AÇIK VEYA ZIMNİ HİÇBİR GARANTİ VERİLMEKSİZİN “OLDUĞU GİBİ” VE “MEVCUT OLDUĞU ŞEKİLDE” SUNULUR. KANUNUN İZİN VERDİĞİ EN GENİŞ ÖLÇÜDE, TİCARİ ELVERİŞLİLİK, BELİRLİ BİR AMACA UYGUNLUK VE HAK İHLALİ OLMAMASINA İLİŞKİN ZIMNİ GARANTİLER DAHİL OLMAK ÜZERE TÜM GARANTİLERİ REDDEDERİZ.",
    s7i1: "Hizmetin kesintisiz, hatasız veya güvenli olacağını garanti etmeyiz.",
    s7i2:
      "Bir menajerlik ajansı, işveren veya oyuncu seçme (casting) hizmeti değiliz. Hizmet bir iş ilişkisi veya temsil ilişkisi doğurmaz. Seçmeleri, rolleri veya kariyer sonuçlarını garanti etmeyiz.",
    s7i3:
      "Yapay zekâ tarafından üretilen veya yapay zekâ destekli özellikler (ör. öneriler, geri bildirim) yalnızca bilgilendirme ve yaratıcı destek amaçlıdır; profesyonel, hukuki veya kariyer tavsiyesi niteliği taşımaz.",
    s7i4: "Hizmeti ve her türlü içeriği veya öneriyi kullanmanın riski sana aittir.",
    s8Title: "8. Sorumluluğun Sınırlandırılması",
    s8p1:
      "GEÇERLİ KANUNUN İZİN VERDİĞİ AZAMİ ÖLÇÜDE, ACTORRISE, BAĞLI KURULUŞLARI VEYA BUNLARIN YÖNETİCİLERİ, YÖNETİM KURULU ÜYELERİ, ÇALIŞANLARI YA DA TEMSİLCİLERİ, BU TÜR ZARARLARIN OLASILIĞI KENDİLERİNE BİLDİRİLMİŞ OLSA BİLE, HİZMETİ KULLANMANDAN VEYA KULLANAMAMANDAN KAYNAKLANAN YA DA BUNUNLA İLGİLİ HİÇBİR DOLAYLI, ARIZİ, ÖZEL, SONUÇSAL VEYA CEZAİ ZARARDAN (KÂR, VERİ VEYA İTİBAR KAYBI DAHİL) HİÇBİR DURUMDA SORUMLU OLMAYACAKTIR.",
    s8p2:
      "BU KOŞULLARDAN VEYA HİZMETTEN KAYNAKLANAN YA DA BUNLARLA İLGİLİ TÜM TALEPLER İÇİN TOPLAM SORUMLULUĞUMUZ, (A) TALEBİN DOĞMASINDAN ÖNCEKİ ON İKİ (12) AY İÇİNDE BİZE ÖDEDİĞİN TUTAR VEYA (B) YÜZ ABD DOLARI (100 USD) TUTARLARINDAN HANGİSİ DAHA YÜKSEKSE ONU AŞAMAZ. BAZI YARGI ALANLARI BELİRLİ ZARARLARIN HARİÇ TUTULMASINA VEYA SINIRLANDIRILMASINA İZİN VERMEZ; BU DURUMLARDA YUKARIDAKİ SINIRLAMALAR O ÖLÇÜDE SANA UYGULANMAYABİLİR.",
    s9Title: "9. Tazminat",
    s9Body:
      "ActorRise'ı ve bağlı kuruluşlarını, yöneticilerini, yönetim kurulu üyelerini, çalışanlarını ve temsilcilerini; (a) Hizmeti kullanmandan, (b) içeriğinden veya davranışından, (c) bu Koşulları veya herhangi bir yasayı ihlal etmenden ya da (d) herhangi bir üçüncü taraf hakkını ihlal etmenden kaynaklanan veya bunlarla ilgili her türlü talep, zarar, kayıp, yükümlülük, maliyet ve masrafa (makul avukatlık ücretleri dahil) karşı tazmin etmeyi, savunmayı ve zarardan ari tutmayı kabul edersin. Senin tarafından tazmin edilmesi gereken herhangi bir konunun savunmasını ve kontrolünü münhasıran üstlenme hakkımızı saklı tutarız; bu durumda savunmada bizimle iş birliği yaparsın.",
    s10Title: "10. Sona Erme",
    s10Body:
      "Hizmeti kullanmayı istediğin zaman bırakabilir ve hesabını kapatabilirsin. Bu Koşulların ihlali dahil herhangi bir nedenle, bildirimde bulunarak veya bulunmadan Hizmete erişimini askıya alabilir veya sonlandırabiliriz. Sona erme ile birlikte Hizmeti kullanma hakkın sona erer. Niteliği gereği sona ermeden sonra da geçerli kalması gereken hükümler (sorumluluk reddi, sorumluluğun sınırlandırılması, tazminat ve uygulanacak hukuk dahil) sona ermeden sonra da geçerliliğini korur.",
    s11Title: "11. Uyuşmazlıklar ve Uygulanacak Hukuk",
    s11Body:
      "Bu Koşullar, kanunlar ihtilafı kurallarına bakılmaksızın Amerika Birleşik Devletleri, Delaware Eyaleti kanunlarına tabidir. Bu Koşullardan veya Hizmetten kaynaklanan ya da bunlarla ilgili her türlü uyuşmazlık münhasıran Delaware'de bulunan eyalet veya federal mahkemelerde çözülür ve sen de oradaki mahkemelerin şahsi yargı yetkisini kabul edersin. Geçerli kanunun izin verdiği ölçüde jüri yargılaması hakkından ve toplu dava veya temsili davaya katılma hakkından feragat edersin.",
    s12Title: "12. Genel Hükümler",
    s12p1:
      "Bu Koşullar, Gizlilik Politikamız ve atıfta bulunduğumuz diğer politikalarla birlikte, Hizmete ilişkin olarak seninle ActorRise arasındaki sözleşmenin tamamını oluşturur. Herhangi bir hakkı veya hükmü uygulamamamız, o haktan veya hükümden feragat ettiğimiz anlamına gelmez. Herhangi bir hükmün geçersiz veya uygulanamaz olduğuna karar verilirse diğer hükümler yürürlükte kalır. Bu Koşullar kapsamındaki haklarımızı ve yükümlülüklerimizi devredebiliriz; sen ise önceden yazılı onayımız olmadan devredemezsin.",
    s12p2:
      "Bu Koşulları istediğimiz zaman değiştirebiliriz. Güncellenmiş Koşulları bu sayfada yayımlar ve “Son güncelleme” tarihini güncelleriz. Önemli değişiklikler, gerekli olduğu durumlarda e-posta veya ürün içi bildirimle duyurulabilir. Değişikliklerin yürürlük tarihinden sonra Hizmeti kullanmaya devam etmen, güncellenmiş Koşulları kabul ettiğin anlamına gelir.",
    s13Title: "13. İletişim",
    s13Body: "Bu Koşullarla ilgili soruların için bize {link} üzerinden ulaşabilirsin.",
    s14Title: "14. DMCA Bildirimi",
    s14Body:
      "ActorRise'daki bir içeriğin telif hakkını ihlal ettiğini düşünüyorsan, şu bilgilerle {email} adresinden bize ulaş: (1) telif hakkıyla korunan eserin belirtilmesi; (2) ihlal ettiği iddia edilen materyalin ve URL'sinin belirtilmesi; (3) iletişim bilgilerin; (4) söz konusu kullanıma telif hakkı sahibinin izin vermediğine iyi niyetle inandığına dair bir beyan; ve (5) elektronik veya ıslak imzan. İnceleyip uygun durumlarda ihlal eden içeriği kaldırırız.",
    privacyLink: "Gizlilik Politikası",
  },
};
