-- ========================================
-- B2B Blog topic queue seed (50 topics)
-- 5 pillars covering reefa.pl service portfolio
-- internal_link_targets reference real /krakow/* and /katowice/* paths
-- ========================================

INSERT INTO public.blog_b2b_topic_queue
  (priority_order, pillar_no, spoke_no, proposed_title, primary_keyword,
   content_type, audience, seo_grade, estimated_volume, word_count_target,
   internal_link_targets, brief_md, source)
VALUES

-- ─────────────────────────────────────────────
-- PILLAR 1: Biura i biurowce klasy A (11 topics)
-- ─────────────────────────────────────────────
(1, 1, '1.1', 'Sprzątanie biura w Krakowie 2026 — cennik, częstotliwość, jak wybrać firmę', 'sprzątanie biura kraków cennik', 'pillar-page', 'A,B', 'A', 1900, 3500,
 '["/krakow/sprzatanie-biur", "/krakow/sprzatanie-biur/kalkulator", "/krakow/cennik", "/krakow/sprzatanie-biurowcow"]'::jsonb,
 'Pillar page o sprzątaniu biur w Krakowie. Strukturuj jako: definicja usługi, segmenty (małe biura/klasa A/BPO-SSC), cennik 2026 (od 10 zł/m²), modele rozliczeń (godzinowo vs ryczałt), checklist wyboru firmy, FAQ. Konkretne dane: 96% retention Reefa, średnia umowa 2.4 roku, 90 000+ pracowników BPO/SSC w Krakowie. Linkuj na sprzątanie biurowców i kalkulator. Word count: 3500. Audience A (CFO/dyrektor administracyjny w średniej firmie) i B (właściciel małej firmy IT/konsultingu).', 'manual'),

(2, 1, '1.2', 'Co powinna zawierać umowa o sprzątanie biura — checklist 2026', 'umowa o sprzątanie biura', 'how-to-guide', 'A,B', 'A', 880, 2500,
 '["/krakow/sprzatanie-biur", "/katowice/sprzatanie-biur", "/krakow/kontakt"]'::jsonb,
 'Praktyczny przewodnik dla osób podpisujących pierwszy kontrakt na sprzątanie biura. 12-15 punktów które MUSZĄ być w umowie: zakres prac, częstotliwość, godziny pracy, dostawa środków, OC do 500k, klauzula RODO, kary umowne za niewykonanie, okres wypowiedzenia, sposób reklamacji, raportowanie. Konkretne pułapki: "umowa na czas nieokreślony bez sankcji", "ryczałt bez zakresu", "brak klauzuli OC". Z naszych obserwacji w 2025: 60% klientów zmieniało dostawcę z powodu źle skonstruowanej umowy.', 'manual'),

(3, 1, '1.3', 'Sprzątanie biur 24/7 dla BPO/SSC w Krakowie i Katowicach', 'sprzątanie biur 24/7', 'pillar-page', 'A', 'B', 320, 3200,
 '["/krakow/sprzatanie-biur", "/katowice/sprzatanie-biur", "/krakow/sprzatanie-biurowcow"]'::jsonb,
 'Specjalistyczny artykuł dla największego segmentu B2B w Krakowie i Katowicach — centrów obsługi finansowej i IT pracujących 24/7. Tematy: rytm pracy zmian (US, EU, APAC overlap), modele sprzątania (poranne 5-7, popołudniowe 13-15, wieczorne 19-22), współpraca z security i facility managerem, raportowanie SLA, znaki rozpoznawcze biurowców klasy A (.KTW, GPP Business Park, Quattro Business Park). Klienci docelowi: Capgemini, IBM, ING, Mentor Graphics. Audience: facility managerowie, dyrektorzy operacyjni.', 'manual'),

(4, 1, '1.4', 'Jak obniżyć koszt sprzątania biura bez utraty jakości — 7 metod', 'jak obniżyć koszt sprzątania biura', 'listicle', 'A,B', 'A', 480, 2200,
 '["/krakow/sprzatanie-biur/kalkulator", "/katowice/sprzatanie-biur/kalkulator", "/krakow/cennik"]'::jsonb,
 'Praktyczna lista 7 sprawdzonych metod redukcji kosztów sprzątania bez utraty jakości. Metody: 1) audyt zakresu pracy (czy faktycznie potrzebne 5x/tydz?), 2) negocjacja stawki przy dłuższej umowie (24-36 miesięcy = 8-15% oszczędności), 3) oddzielenie zakupu środków od pracy (oszczędność 5-10%), 4) zmiana harmonogramu na off-peak hours, 5) audyt powierzchni faktycznie używanej, 6) przejście z ryczałtu na rozliczenie godzinowe dla małych biur, 7) konsolidacja u jednego dostawcy obsługującego kilka lokalizacji. Realne liczby z naszych umów w 2025.', 'manual'),

(5, 1, '1.5', 'ESG w sprzątaniu biur — co wymagają korporacyjni klienci w 2026', 'ESG sprzątanie biura', 'pillar-page', 'A', 'B', 210, 2800,
 '["/krakow/sprzatanie-biur", "/krakow/sprzatanie-biurowcow", "/o-firmie"]'::jsonb,
 'Przegląd wymagań ESG w sprzątaniu biur dla dużych korporacji. Trzy obszary: Environmental (eko-środki, EU Ecolabel, redukcja plastiku, woda, energia), Social (umowy o pracę nie zlecenia, płaca minimum +20%, godziwa rotacja), Governance (transparentność dokumentacji, RODO, anty-korupcyjne klauzule). Konkretne certyfikaty wymagane przez klientów Big 4 (PwC, EY, Deloitte, KPMG): EU Ecolabel, ISO 14001, ISO 45001. Reefa z perspektywy 2025-2026 — co już mamy, co dopracowujemy. Audience: dyrektorzy administracyjni odpowiedzialni za sustainability reporting.', 'manual'),

(6, 1, '1.6', 'Sprzątanie biurowca klasy A — zakres umowy z property managerem', 'sprzątanie biurowca property manager', 'how-to-guide', 'C', 'B', 170, 2500,
 '["/krakow/sprzatanie-biurowcow", "/katowice/sprzatanie-biurowcow"]'::jsonb,
 'Artykuł dla zarządców nieruchomości (Echo, Globalworth, Skanska, Cavatina, Gleeds) przygotowujących RFP na sprzątanie biurowca. Sekcje: zakres części wspólnych (lobby, korytarze, windy, sanitariaty, parking), zakres najemców (różne SLA), procedury bezpieczeństwa (karty dostępu, BHP, RCP), raportowanie do właściciela budynku, KPI (response time na zgłoszenie, miesięczny audyt jakości), kary umowne. Konkretne stawki rynkowe za m² lobby vs powierzchnie najemców w 2026. Reefa w GPP Business Park, .KTW, Atrium Plaza jako case.', 'manual'),

(7, 1, '1.7', 'Eko-sprzątanie biura — certyfikat EU Ecolabel a oczekiwania pracowników', 'eko sprzątanie biura ecolabel', 'pillar-page', 'A,B', 'B', 140, 2400,
 '["/krakow/sprzatanie-biur", "/o-firmie"]'::jsonb,
 'Pogłębiony artykuł o eko-sprzątaniu biur. Co konkretnie znaczy "eko" — nie marketing, ale certyfikaty (EU Ecolabel, Nordic Swan, Cradle to Cradle, Blue Angel). Konkretne preparaty z certyfikatem: Tana GreenCare, Diversey Sure, Clinex Eco. Realny koszt eko-sprzątania vs konwencjonalnego (różnica ~5-10%, nie 30% jak głoszą reklamy). Wpływ na zdrowie pracowników (alergeny, VOC). Wymagania pracowników 2025-2026: badania pokazują 67% woli pracować w biurach z eko-sprzątaniem. Reefa: 98% środków biodegradowalnych.', 'manual'),

(8, 1, '1.8', 'Sprzątanie po przeprowadzce biura — checklist dla zarządcy', 'sprzątanie po przeprowadzce biura', 'how-to-guide', 'A,B', 'B', 320, 2200,
 '["/krakow/sprzatanie-po-budowie", "/krakow/sprzatanie-biur", "/krakow/kontakt"]'::jsonb,
 'Checklist dla osób organizujących przeprowadzkę biura — co powinno się wydarzyć przed wprowadzeniem zespołu. Etap 1: starе biuro (sprzątanie końcowe pod oddanie wynajmującemu), etap 2: nowe biuro (sprzątanie pobudowlane jeśli świeże wykończenie, sprzątanie generalne jeśli używane), etap 3: pierwsze tygodnie (intensywniejsza częstotliwość). Konkretne czasy: 50m² biuro = 4-6h, 200m² = 8-12h, 1000m²+ = 2-3 dni z ekipą 4-6 osób. Realne koszty 2026. Reefa pakiet "przeprowadzka" — uniwersalna wycena.', 'manual'),

(9, 1, '1.9', 'Sprzątanie biura nocą czy rano — porównanie dwóch modeli', 'sprzątanie biura nocą czy rano', 'comparison', 'A,B', 'B', 110, 2000,
 '["/krakow/sprzatanie-biur", "/katowice/sprzatanie-biur"]'::jsonb,
 'Comparison artykuł porównujący dwa najpopularniejsze modele sprzątania biura. Model A: rano (5:00-7:00 przed startem zmiany) — plusy/minusy z perspektywy pracowników, koordynatora, kosztów. Model B: wieczorem/nocą (po 19:00) — plusy/minusy. Tabela porównawcza: stawka godzinowa, dostępność personelu, ryzyka bezpieczeństwa, akustyka, kolizja z wydarzeniami biurowymi. Realne dane z naszych umów: 65% biur wybiera wczesny ranek, 25% wieczór, 10% mix. Audience: właściciele małych firm i facility managerowie planujący nowy kontrakt.', 'manual'),

(10, 1, '1.10', 'Audyt jakości sprzątania biura — KPI i sankcje umowne', 'audyt jakości sprzątania', 'how-to-guide', 'A,C', 'C', 90, 2300,
 '["/krakow/sprzatanie-biurowcow", "/katowice/sprzatanie-biurowcow"]'::jsonb,
 'Praktyczny przewodnik dla zarządcy nieruchomości lub dyrektora administracyjnego po systemie audytu jakości sprzątania biura. Tematy: KPI (response time, completion rate, complaint rate, monthly inspection score), narzędzia (system QR-kodów, comiesięczny raport, kontrola spotowa), sankcje umowne (kary procentowe, prawo do wypowiedzenia, retencja płatności), tabela "kara za co". Konkretny template kontroli jakości używany przez Reefa. Realne case studies. Word count 2300, audience C (zarządca nieruchomości).', 'manual'),

(11, 1, '1.11', 'Sprzątanie biura w Katowicach — porównanie ofert dla GPP Business Park i .KTW', 'sprzątanie biura katowice', 'comparison', 'A', 'B', 480, 2600,
 '["/katowice/sprzatanie-biur", "/katowice/sprzatanie-biurowcow", "/katowice/cennik"]'::jsonb,
 'Specjalistyczny artykuł dla najemców biur w klasy A w Katowicach — porównanie usług sprzątania w największych biurowcach. GPP Business Park (3 budynki, 80 000 m², tenant mix BPO/SSC), .KTW I/II (133m, headline klasa A), Silesia Business Park, Atrium Plaza, A4 Business Park. Co różni — security procedures, dostępność, cennik m². Konkretne stawki w Katowicach 2026. Property managerowie (Echo, Skanska, Globalworth) i ich wymagania. Reefa jako lokalna firma z koordynatorem katowickim.', 'manual'),

-- ─────────────────────────────────────────────
-- PILLAR 2: Placówki medyczne (8 topics)
-- ─────────────────────────────────────────────
(12, 2, '2.1', 'Sprzątanie placówki medycznej w Polsce — wytyczne sanepidu 2026', 'sprzątanie placówki medycznej', 'pillar-page', 'A,B', 'A', 590, 4000,
 '["/krakow/sprzatanie-placowek-medycznych", "/katowice/sprzatanie-placowek-medycznych"]'::jsonb,
 'Pillar page o regulacjach prawnych dotyczących sprzątania placówek medycznych w Polsce. Sekcje: ustawa z 5 grudnia 2008 o zapobieganiu zakażeniom (kluczowe artykuły), rozporządzenia Ministra Zdrowia (dezynfekcja, segregacja odpadów medycznych), wytyczne Państwowej Inspekcji Sanitarnej, normy EN 14476 (wirusobójczość) i EN 1276 (bakteriobójczość). Wymagane dokumenty od firmy sprzątającej: protokoły dezynfekcji, karty charakterystyki preparatów, szkolenia personelu, klauzule RODO. Konkretne sankcje za niespełnienie. Word count 4000. Audience A (dyrektorzy medyczni).', 'manual'),

(13, 2, '2.2', 'Cennik sprzątania przychodni i gabinetów lekarskich w Krakowie 2026', 'cennik sprzątania przychodni', 'pillar-page', 'A,B', 'A', 320, 2800,
 '["/krakow/sprzatanie-placowek-medycznych", "/krakow/cennik"]'::jsonb,
 'Konkretny cennik 2026 dla różnych typów placówek medycznych w Krakowie. Stawki za m²/miesięcznie: gabinet POZ (12-15 zł), gabinet zabiegowy (16-22 zł), klinika diagnostyczna (14-18 zł), centrum stomatologiczne (15-20 zł), przychodnia 1000+ m² (10-13 zł). Czynniki podwyższające: częstotliwość, pora dnia, dezynfekcja zakresowa. Tabela porównawcza. Realne kontrakty Reefa z 2025: Diamed Medical Center, Otto Bock. Audience: właściciele i dyrektorzy małych klinik prywatnych.', 'manual'),

(14, 2, '2.3', 'Dezynfekcja medyczna — różnica między sterylnością a higieną szpitalną', 'dezynfekcja medyczna', 'pillar-page', 'A', 'B', 170, 2400,
 '["/krakow/sprzatanie-placowek-medycznych", "/katowice/sprzatanie-placowek-medycznych"]'::jsonb,
 'Edukacyjny artykuł wyjaśniający różnice między pojęciami często mylonymi w branży medycznej. Sterylność (brak jakiegokolwiek mikroorganizmu, blok operacyjny), antyseptyka (powierzchnie skóry pacjenta), higiena szpitalna (powierzchnie środowiskowe — podłogi, klamki, łóżka). Co kiedy stosować, jakie środki, jakie protokoły. Czasy ekspozycji preparatów (5/15/30 minut). Częste błędy: używanie spirytusu na powierzchniach (paruje za szybko), używanie chloroform (uszkadza powierzchnie). Audience: koordynatorzy ds. higieny, pielęgniarki epidemiologiczne.', 'manual'),

(15, 2, '2.4', 'Sprzątanie gabinetu stomatologicznego — wymagania prawne i rzeczywistość', 'sprzątanie gabinetu stomatologicznego', 'how-to-guide', 'A,B', 'B', 260, 2300,
 '["/krakow/sprzatanie-placowek-medycznych", "/krakow/sprzatanie-placowek-medycznych/kalkulator"]'::jsonb,
 'Specjalistyczny przewodnik po sprzątaniu gabinetu stomatologicznego — placówki o specyficznych wymaganiach (aerozole zabiegowe, krew, ślina, materiały protetyczne). Czego wymaga prawo: dezynfekcja po każdym pacjencie (powierzchnie blisko-zabiegowe), codzienne sprzątanie zakresowe, tygodniowe pełne. Środki: glutaraldehyd, kwas peroctowy, podchloryn sodu — różnice w zastosowaniu. Częstotliwość kontroli sanepidu. Realne stawki 2026: gabinet 30-50 m² = 600-1200 zł/miesięcznie. Audience: stomatolodzy prywatni właściciele praktyk.', 'manual'),

(16, 2, '2.5', 'Sprzątanie szpitala vs przychodni — różnice w protokołach i kosztach', 'sprzątanie szpitala', 'comparison', 'A', 'B', 90, 2500,
 '["/krakow/sprzatanie-placowek-medycznych", "/katowice/sprzatanie-placowek-medycznych"]'::jsonb,
 'Comparison między dwoma kategoriami placówek. Szpital (oddziały, blok operacyjny, OIOM, izolatorium) — protokół 24h/7, dezynfekcja po każdej zmianie pacjenta, pełen log wszystkich czynności, certyfikowany personel z badaniami nosicielstwa. Przychodnia (gabinety, poczekalnie, rejestracja, sanitariaty) — protokół oparty na harmonogramie, dezynfekcja zakresowa po godzinach przyjęć. Tabela porównawcza kosztów m²/miesięcznie. Audience A: dyrektorzy administracyjni szpitali planujący outsourcing.', 'manual'),

(17, 2, '2.6', 'Środki dezynfekujące dla placówek medycznych — co wybrać i dlaczego', 'środki dezynfekujące medyczne', 'pillar-page', 'A,B', 'B', 210, 2400,
 '["/krakow/sprzatanie-placowek-medycznych"]'::jsonb,
 'Praktyczny przegląd certyfikowanych środków dezynfekcyjnych dostępnych na polskim rynku. Kategorie: alkoholowe (etanol, izopropanol — szybkie, ulotne), aldehydowe (glutaraldehyd, formaldehyd — głębokie ale toksyczne), peroctowe (kwas peroctowy — uniwersalne ale agresywne), chlorowe (podchloryn sodu — tanie ale uszkadzają powierzchnie), QAV (czwartorzędowe sole amoniowe — bezpieczne dla powierzchni). Konkretne marki: Schülke, Ecolab, Diversey, Tana. EN normy. Realne ceny netto za litr koncentratu 2026. Audience: koordynatorzy higieny.', 'manual'),

(18, 2, '2.7', 'Audyt sanitarny w placówce medycznej — jak się przygotować', 'audyt sanitarny placówki medycznej', 'how-to-guide', 'A,B', 'C', 70, 2200,
 '["/krakow/sprzatanie-placowek-medycznych", "/katowice/sprzatanie-placowek-medycznych"]'::jsonb,
 'Praktyczny przewodnik po przygotowaniu placówki medycznej do kontroli sanepidu. Co kontrolerzy sprawdzają (lista 30+ punktów), wymagana dokumentacja (księgi sprzątań, protokoły dezynfekcji, karty charakterystyki preparatów, świadectwa szkoleń personelu, badania okresowe), najczęstsze uchybienia 2025 (z naszych obserwacji u klientów), procedury naprawcze przy zaleceniach pokontrolnych. Reefa pomaga klientom przejść kontrole — case study. Audience: dyrektorzy administracyjni i koordynatorzy ds. higieny.', 'manual'),

(19, 2, '2.8', 'Outsourcing sprzątania placówki medycznej — kalkulacja vs własny etat', 'outsourcing sprzątania medycznego', 'comparison', 'A,B', 'B', 110, 2400,
 '["/krakow/sprzatanie-placowek-medycznych/kalkulator", "/krakow/cennik"]'::jsonb,
 'Comparison ekonomiczny: czy zatrudnić własnych sprzątaczek czy zlecić firmie? Pełna kalkulacja dla klinik 200/500/1000 m². Koszty etatu: pensja brutto+brutto, ZUS, urlopy, zastępstwa, sprzęt, środki, szkolenia, BHP, badania okresowe. Koszty outsourcingu: stała stawka netto + VAT. Czynniki dodatkowe: ryzyko absencji, problemy z zastępstwem, zarządzanie pracownikami, koszt rotacji. Realne wyliczenia: dla 500 m² placówki własny etat = 8 500 zł/miesięcznie, outsourcing = 6 500 zł/miesięcznie. Audience: dyrektorzy finansowi.', 'manual'),

-- ─────────────────────────────────────────────
-- PILLAR 3: Wspólnoty mieszkaniowe i bloki (10 topics)
-- ─────────────────────────────────────────────
(20, 3, '3.1', 'Sprzątanie wspólnoty mieszkaniowej — przewodnik dla zarządcy', 'sprzątanie wspólnoty mieszkaniowej', 'pillar-page', 'C', 'B', 1300, 3500,
 '["/krakow/sprzatanie-dla-wspolnot-mieszkaniowych", "/katowice/sprzatanie-dla-wspolnot-mieszkaniowych"]'::jsonb,
 'Pillar page dla zarządców wspólnot mieszkaniowych. Sekcje: zakres typowego sprzątania (codzienne klatki, tygodniowe okna, miesięczne generalne), wybór firmy (kryteria oceny, sygnały ostrzegawcze), umowa wspólnoty (zapisy chroniące zarząd), system reklamacji (QR-kody, telefon koordynatora, raporty), kalkulacja kosztu wspólnoty 30/50/100 lokali, najczęstsze błędy zarządców (krótka umowa, brak SLA, jeden dostawca dla wszystkich części). Reefa dla wspólnot 96% retention. Word count 3500.', 'manual'),

(21, 3, '3.2', 'Cennik sprzątania bloku i klatki schodowej w Krakowie 2026', 'cennik sprzątania klatki schodowej', 'pillar-page', 'C', 'B', 720, 2400,
 '["/krakow/sprzatanie-blokow", "/katowice/sprzatanie-blokow"]'::jsonb,
 'Konkretny cennik 2026 dla różnych typów zabudowy w Krakowie i Katowicach. Bloki: 4-piętrowy z 1 klatką (350-600 zł), 11-piętrowy z 2 windami (1200-2200 zł), wieżowiec 35-piętrowy (4500-7500 zł). Czynniki wpływające: liczba kondygnacji, ilość klatek, okna w częściach wspólnych, mycie windy. Tabela porównawcza dla różnych modeli (3x/tydz vs codziennie). Realne stawki Reefa 2026. Audience: prezesy zarządów spółdzielni i wspólnot.', 'manual'),

(22, 3, '3.3', 'Jak wybrać firmę sprzątającą do wspólnoty — kryteria oceny', 'jak wybrać firmę sprzątającą wspólnoty', 'how-to-guide', 'C', 'B', 320, 2400,
 '["/krakow/sprzatanie-dla-wspolnot-mieszkaniowych"]'::jsonb,
 'Praktyczny przewodnik dla zarządców wspólnot wybierających dostawcę usługi sprzątania. 8 kryteriów oceny: 1) ubezpieczenie OC do min 200k, 2) umowy o pracę dla personelu (nie zlecenia), 3) referencje z 3+ wspólnot o podobnej skali, 4) dedykowany koordynator z numerem prywatnym, 5) system reklamacyjny (QR/email/telefon), 6) miesięczna foto-dokumentacja, 7) zastępstwa w 24h przy absencji, 8) lokalna obecność (nie sieci ogólnopolskie). Czerwone flagi: brak OC, ryczałt bez zakresu, jeden numer call center. Audience: prezesy zarządów wspólnot.', 'manual'),

(23, 3, '3.4', 'Umowa o sprzątanie wspólnoty mieszkaniowej — zapisy chroniące zarząd', 'umowa sprzątanie wspólnoty', 'how-to-guide', 'C', 'B', 170, 2300,
 '["/krakow/sprzatanie-dla-wspolnot-mieszkaniowych", "/krakow/kontakt"]'::jsonb,
 'Praktyczne wskazówki dla zarządu wspólnoty przy podpisywaniu kontraktu na sprzątanie. Kluczowe zapisy chroniące wspólnotę: konkretny zakres (lista czynności + częstotliwość), konkretne godziny pracy, raportowanie miesięczne, kary umowne za niewykonanie (zwykle 0,5-1% wartości miesięcznej za każdy dzień zwłoki), klauzula wypowiedzenia bez konsekwencji finansowych w pierwszych 30 dniach (okres próbny), dokumentacja zdjęciowa, OC dostawcy. Czerwone flagi w propozycjach: "ryczałt na rok", "brak okresu próbnego". Template umowy do pobrania.', 'manual'),

(24, 3, '3.5', 'Reklamacje od mieszkańców — system zgłaszania uwag w sprzątaniu', 'reklamacje sprzątanie wspólnoty', 'how-to-guide', 'C', 'B', 90, 2200,
 '["/krakow/sprzatanie-dla-wspolnot-mieszkaniowych", "/katowice/sprzatanie-dla-wspolnot-mieszkaniowych"]'::jsonb,
 'Praktyczny przewodnik po zarządzaniu reklamacjami mieszkańców wobec firmy sprzątającej. Optymalne kanały: 1) system QR-kodów na klatce schodowej (zgłoszenie → SMS do koordynatora w 30 sekund), 2) email zarządu z dedykowanym aliasem, 3) telefon prywatny koordynatora. Najczęstsze typy reklamacji: brak sprzątania w terminie (40%), niedokładne (30%), pretensje do konkretnego pracownika (20%), inne (10%). Czas reakcji w dobrym kontrakcie: do 24h. Reefa rejestruje wszystkie zgłoszenia i prezentuje miesięcznie zarządowi. Audience: zarządcy wspólnot.', 'manual'),

(25, 3, '3.6', 'Sprzątanie kamienicy zabytkowej — szczegóły konserwatorskie', 'sprzątanie kamienicy zabytkowej', 'pillar-page', 'C', 'B', 110, 2500,
 '["/krakow/sprzatanie-kamienic", "/katowice/sprzatanie-kamienic"]'::jsonb,
 'Specjalistyczny artykuł dla zarządców kamienic w rejestrze zabytków. Materiały oryginalne — cegła klinkierowa, piaskowiec, granit, mozaika, drewno dębowe, kute żelazo, mosiądz, brąz. Środki dozwolone (pH 6-8) i niedozwolone (silne kwasy, sody, agresywne środki na bazie chloru). Współpraca z wojewódzkim konserwatorem zabytków, wymagana dokumentacja, sankcje za uszkodzenia substancji zabytkowej. Realne case studies: kamienice Mariacka, Stawowa w Katowicach. Audience: zarządcy wspólnot kamienic w Krakowie i Katowicach.', 'manual'),

(26, 3, '3.7', 'Sprzątanie windy w bloku — częstotliwość, środki, koszt', 'sprzątanie windy', 'how-to-guide', 'C', 'B', 140, 2000,
 '["/krakow/sprzatanie-blokow"]'::jsonb,
 'Praktyczny przewodnik po sprzątaniu wind w blokach mieszkaniowych. Częstotliwość: minimum 2 razy dziennie w wieżowcach (rano i po południu), 1 raz dziennie w blokach 4-11 piętrowych, dezynfekcja powierzchni dotykowych po każdym sprzątaniu. Środki: dezynfekcja przycisków (alkohol 70% lub QAV), polerowanie luster bez smug (Cif Cream), sprzątanie podłogi (mop wilgotny + środek przeciwpoślizgowy). Koszt dodatkowego serwisu windy: 100-200 zł/miesięcznie/winda. Częste błędy: agresywne środki uszkadzające panel sterowania.', 'manual'),

(27, 3, '3.8', 'Sprzątanie altany śmietnikowej — wymogi prawne i higieniczne', 'sprzątanie altany śmietnikowej', 'how-to-guide', 'C', 'B', 50, 2000,
 '["/krakow/sprzatanie-blokow", "/krakow/sprzatanie-dla-wspolnot-mieszkaniowych"]'::jsonb,
 'Praktyczny przewodnik dla zarządców wspólnot. Co wymaga prawo (rozporządzenie Ministra Środowiska — utrzymanie czystości altan), częstotliwość (minimum 2 razy w tygodniu, w lecie częściej), środki dezynfekujące (chlor lub QAV), sezon letni vs zimowy (różne tempo zanieczyszczenia). Najczęstsze problemy: ślady moczu zwierząt, padlina, gryzonie, śmieci poza pojemnikami. Procedury: zgłoszenie do zarządu, foto-dokumentacja, mycie ciśnieniowe, dezynfekcja, dezodoryzacja. Koszt comiesięcznego serwisu: 80-200 zł/altanę. Audience: zarządcy wspólnot.', 'manual'),

(28, 3, '3.9', 'Sprzątanie po awarii w bloku — zalanie, pożar, akt wandalizmu', 'sprzątanie po awarii bloku', 'how-to-guide', 'C', 'B', 70, 2200,
 '["/krakow/sprzatanie-po-remoncie", "/katowice/sprzatanie-po-remoncie"]'::jsonb,
 'Specjalistyczny przewodnik po sytuacjach kryzysowych w blokach mieszkaniowych. Trzy główne typy awarii: zalanie (woda + wilgoć + ryzyko grzybów), pożar (sadza + dym + chemikalia), akt wandalizmu (graffiti, uszkodzone drzwi, rozbite szyby). Procedury: 1) zabezpieczenie miejsca, 2) dokumentacja foto dla ubezpieczyciela, 3) ekspresowy zespół naprawczy w 4-8h, 4) sprzątanie powykonawcze, 5) raport. Reefa serwis ekspresowy: 4h od zgłoszenia, dostępny 24/7. Realne przykłady z 2025. Audience: zarządcy wspólnot.', 'manual'),

(29, 3, '3.10', 'Sprzątanie wspólnoty z gastronomią na parterze — koordynacja', 'sprzątanie wspólnoty gastronomia', 'how-to-guide', 'C', 'B', 30, 2100,
 '["/krakow/sprzatanie-kamienic", "/katowice/sprzatanie-kamienic"]'::jsonb,
 'Specjalistyczny artykuł dla zarządców wspólnot z lokalami gastronomicznymi na parterze (restauracje, puby, kawiarnie). Wyzwania: zwiększona ilość zanieczyszczeń (rozlane napoje, jedzenie, dym), nietypowe godziny pracy lokali (ranki vs noce), konflikty harmonogramów (sprzątanie vs ruch klientów), zwiększone wymagania higieniczne. Koordynacja z najemcami parteru: ranne sprzątanie przed otwarciem (7:00-10:00) lub nocne po zamknięciu (po 23:00). Reefa w kamienicach Mariacka, Stawowa w Katowicach. Audience: zarządcy starszych kamienic.', 'manual'),

-- ─────────────────────────────────────────────
-- PILLAR 4: Pobudowlane i poremontowe (7 topics)
-- ─────────────────────────────────────────────
(30, 4, '4.1', 'Sprzątanie po budowie w Krakowie — etapy, czas, koszt', 'sprzątanie po budowie kraków', 'pillar-page', 'A,B', 'A', 720, 3000,
 '["/krakow/sprzatanie-po-budowie", "/krakow/sprzatanie-po-budowie/kalkulator"]'::jsonb,
 'Pillar page o sprzątaniu pobudowlanym w Krakowie. Etapy: pierwsze sprzątanie (pył, gruz), szczegółowe (fugi, narożniki), odbiorowe (handover dla inwestora/najemcy). Konkretne czasy: mieszkanie 50m² = 4-6h, biurowiec 5000m² = 4-7 dni z ekipą 4-8 osób. Sprzęt profesjonalny (Karcher, Hako, Nilfisk). Współpraca z generalnym wykonawcą — odprawy, kary umowne za opóźnienia. Konkretne stawki 2026 dla różnych skali. Reefa case studies: .KTW, GPP Business Park, mieszkania w Wola Justowska. Word count 3000.', 'manual'),

(31, 4, '4.2', 'Cennik sprzątania pobudowlanego mieszkania 2026', 'cennik sprzątania pobudowlanego', 'pillar-page', 'A,B', 'B', 590, 2400,
 '["/krakow/sprzatanie-po-budowie/kalkulator", "/krakow/cennik"]'::jsonb,
 'Konkretny cennik 2026 dla sprzątania pobudowlanego mieszkań w Krakowie. Stawki: 50m² stan deweloperski = 1200-2400 zł, 80m² = 1600-3000 zł, 120m² premium = 2800-4800 zł. Czynniki wpływające: ilość okien, sanitariaty, materiały (parkiet vs laminat), trudność dostępu. Pakiet 3-etapowy vs jednorazowe sprzątanie. Realne ceny rynkowe vs Reefa. Co wpływa na wycenę po wizycie technicznej. Audience: kupujący nowe mieszkania od deweloperów (Atal, Develia, Echo, Robyg).', 'manual'),

(32, 4, '4.3', 'Sprzątanie pobudowlane biurowca klasy A — case study', 'sprzątanie pobudowlane biurowca', 'case-study', 'A,C', 'B', 70, 2500,
 '["/krakow/sprzatanie-po-budowie", "/katowice/sprzatanie-po-budowie"]'::jsonb,
 'Konkretny case study sprzątania pobudowlanego biurowca klasy A. Liczby: 8000 m² powierzchni najemnej, 13 pięter, 4 windy, podziemny parking 350 miejsc. Ekipa 8-12 osób przez 5 dni. Etapy szczegółowe: pył budowlany na ścianach, naklejki PCV ze stolarki aluminiowej, zaprawa na szybach, fugi na 600m² posadzek. Współpraca z generalnym wykonawcą (Skanska/Mota-Engil), property managerem, koordynatorem inwestora. Hot zones (lobby, recepcje), cold zones (pomieszczenia techniczne). Procedury BHP. Audience: dyrektorzy inwestycji.', 'manual'),

(33, 4, '4.4', 'Sprzątanie po remoncie biura — koordynacja z najemcami', 'sprzątanie po remoncie biura', 'how-to-guide', 'A,B', 'B', 110, 2200,
 '["/krakow/sprzatanie-po-remoncie", "/katowice/sprzatanie-po-remoncie", "/krakow/sprzatanie-biur"]'::jsonb,
 'Specjalistyczny artykuł o sprzątaniu po remoncie w aktywnym biurowcu. Wyzwania: najemcy pracujący równolegle, hałas, kurz przedostający się do innych pomieszczeń, ograniczony dostęp. Procedury: zabezpieczenie folią, koordynacja z property managerem (kiedy można uruchomić odkurzacz przemysłowy), praca w trybie "pakiet weekendowy". Etapy: dzień 1 — pył gruby, dzień 2 — szczegółowe, dzień 3 — odbiór. Realne case studies: remonty biur w GPP Business Park i Atrium Plaza. Audience: facility managerowie.', 'manual'),

(34, 4, '4.5', 'Pył budowlany — dlaczego nie wystarczy zwykłe sprzątanie', 'pył budowlany sprzątanie', 'pillar-page', 'A,B', 'C', 90, 2100,
 '["/krakow/sprzatanie-po-budowie", "/krakow/sprzatanie-po-remoncie"]'::jsonb,
 'Edukacyjny artykuł wyjaśniający dlaczego pył budowlany wymaga specjalistycznego podejścia. Skład: gips, cement, wapno, pył metaliczny, drewno, izolacje, mineraly. Niebezpieczeństwa: alergie, podrażnienia dróg oddechowych (krzemica), uszkodzenia mebli i elektroniki. Zwykły odkurzacz domowy = pył wyłapany w 50%, profesjonalny przemysłowy z filtrem HEPA = 99%. Specjalistyczne narzędzia: odkurzacze Karcher NT 70/2, Nilfisk Attix 50, mopy z mikrofibry premium. Środki na pył gipsowy (Tana Tanex Power). Audience: właściciele nowych mieszkań i biur.', 'manual'),

(35, 4, '4.6', 'Sprzątanie po remoncie kamienicy — techniki konserwatorskie', 'sprzątanie kamienicy po remoncie', 'pillar-page', 'C', 'B', 50, 2200,
 '["/krakow/sprzatanie-po-remoncie", "/katowice/sprzatanie-kamienic"]'::jsonb,
 'Specjalistyczny artykuł o sprzątaniu po remoncie w obiektach zabytkowych. Czym różni się remont kamienicy od remontu mieszkania w bloku — oryginalne materiały (kamienne stopnie, kute poręcze, drewniana stolarka, mozaiki posadzkowe), wymagania konserwatorskie, środki o pH neutralnym. Konkretne procedury: usuwanie kleju z mozaik (woda destylowana + delikatny detergent), czyszczenie zaprawy z kamienia (specjalistyczne preparaty Faber, Lithofin). Reefa we współpracy z konserwatorem zabytków ZW Konserwator Katowice. Audience: zarządcy wspólnot kamienic.', 'manual'),

(36, 4, '4.7', 'Mycie okien po budowie — zaprawa, folia, naklejki', 'mycie okien po budowie', 'how-to-guide', 'A,B', 'B', 210, 2000,
 '["/krakow/sprzatanie-po-budowie"]'::jsonb,
 'Praktyczny przewodnik po myciu okien w stanie pobudowlanym. Wyzwania: zaprawa cementowa schnięta na szybach (najtrudniejsze), pasy folii ochronnej (klej resztkowy), naklejki marketingowe (silikon na profilach), zachlapania farbami. Procedury: namaczanie zaprawy 10-15 minut (woda + detergent), usuwanie skrobakami (typu Sörbo), polerowanie ściereczką z mikrofibry, ostatnie wykończenie roztworem alkoholu izopropylowego. Realny czas dla mieszkania 50m² z 8 oknami: 4-6h. Sprzęt profesjonalny vs domowy. Audience: właściciele nowych nieruchomości.', 'manual'),

-- ─────────────────────────────────────────────
-- PILLAR 5: Specjalistyczne (14 topics)
-- ─────────────────────────────────────────────
(37, 5, '5.1', 'Sprzątanie szkoły publicznej — przetargi, terminy, wymagania', 'sprzątanie szkoły przetarg', 'pillar-page', 'A', 'B', 260, 2800,
 '["/krakow/sprzatanie-placowek-szkolnych", "/katowice/sprzatanie-placowek-szkolnych"]'::jsonb,
 'Pillar page dla dyrektorów szkół publicznych planujących przetarg na sprzątanie. Procedura PZP (prawo zamówień publicznych): SIWZ, kryteria oceny (cena vs doświadczenie), wymagana dokumentacja od oferentów (zaświadczenie ZUS/US, OC, referencje, opisy procedur sanitarnych). Najczęstsze błędy w SIWZ: brak konkretnego zakresu, niejasne kryteria oceny, zbyt krótkie terminy realizacji. Specyfika szkoły: dni egzaminów, ferie, wakacyjne sprzątanie generalne. Reefa case study: przetargi wygrane w Katowicach. Audience: dyrektorzy szkół.', 'manual'),

(38, 5, '5.2', 'Sprzątanie przedszkola — środki dopuszczone do kontaktu z dziećmi', 'sprzątanie przedszkola', 'how-to-guide', 'A,B', 'B', 480, 2300,
 '["/krakow/sprzatanie-placowek-szkolnych", "/katowice/sprzatanie-placowek-szkolnych"]'::jsonb,
 'Specjalistyczny artykuł o sprzątaniu przedszkoli (państwowych i prywatnych). Wymagania prawne: tylko atestowane środki bezpieczne dla dzieci (certyfikat EU Ecolabel, brak alergenów, hipoalergiczne, niepalne). Konkretne marki: Tana GreenCare Kids, Clinex Eco, Diversey Suma. Procedury: codzienne dezynfekcje powierzchni dotykowych (klamki, włączniki, blaty), tygodniowe pełne sprzątanie, miesięczne dezynfekcja zabawek. Czas pracy: po godzinach świetlicy (po 17:00). Audience: dyrektorzy przedszkoli prywatnych, dyrektorzy państwowych przedszkoli.', 'manual'),

(39, 5, '5.3', 'Sprzątanie siłowni — protokół higieny dla stref mokrych', 'sprzątanie siłowni', 'pillar-page', 'A,B', 'B', 590, 2500,
 '["/krakow/sprzatanie-silowni", "/katowice/sprzatanie-silowni"]'::jsonb,
 'Specjalistyczny artykuł o higienie stref mokrych w klubach fitness (sauny, prysznice, baseny). Najczęstsze ryzyka: grzybice, bakterie, wirusy (HBV, HIV w mikro-uszkodzeniach skóry). Protokoły: codzienna dezynfekcja po zamknięciu (alkoholowo-aldehydowa), tygodniowe głębokie czyszczenie fug i kafli (środki przeciwgrzybicze), miesięczna pełna dezynfekcja sauny (wymiana żwirku, mycie dwóch desek lawowych), kwartalne czyszczenie filtrów basenowych. Konkretne preparaty: Tana Sauna&Spa, Clinex Anti-Fungus. Realne stawki dla klubów 1500-2500 m². Audience: właściciele klubów fitness.', 'manual'),

(40, 5, '5.4', 'Sprzątanie hali garażowej — sprzęt, częstotliwość, koszt', 'sprzątanie hali garażowej', 'pillar-page', 'A,C', 'B', 320, 2700,
 '["/krakow/mycie-hal-garazowych", "/katowice/mycie-hal-garazowych"]'::jsonb,
 'Pillar page o myciu hal garażowych. Skala: galerie handlowe (Galeria Krakowska 1500 miejsc, Bonarka 1200), biurowce klasy A (Quattro Business Park, .KTW), apartamentowce. Sprzęt: maszyny szorująco-zbierające (Hako Scrubmaster B260R, Nilfisk SC8000, Kärcher BR 95/350), myjki ciśnieniowe, odkurzacze przemysłowe. Chemia: degreasery na olej (Tana Tanex Auto, Karcher RM 31), preparaty na gumę z opon (alkaliczne odplamiacze), preparaty solo dla kafli/betonu. Częstotliwość: 1-2x/tydz mycie posadzek + miesięczne generalne. Realne stawki 2026.', 'manual'),

(41, 5, '5.5', 'Sprzątanie centrum handlowego — dzienna obsługa galerii', 'sprzątanie centrum handlowego', 'pillar-page', 'A,C', 'C', 50, 2500,
 '["/krakow/mycie-hal-garazowych"]'::jsonb,
 'Specjalistyczny artykuł o sprzątaniu centrów handlowych. Przykłady krakowskie: Galeria Krakowska, Bonarka City Center, Galeria Kazimierz, M1, Serenada. Skala: 80 000-120 000 m² powierzchni najemnej + części wspólne (passaże, food court, sanitariaty, parking). Praca w trybie ciągłym: 6:00-23:00 z dyskretną obecnością personelu. Specyfika: zaplamione podłogi food courtu (lody, sosy, jedzenie), tłum w weekendy, awarie (rozsypane towary, rozlane napoje). Sprzęt mobilny (wózki sprzątające), praca w 3 zmianach. Audience: facility managerowie galerii.', 'manual'),

(42, 5, '5.6', 'Sprzątanie hotelu — różnica między housekeeping a sprzątaniem ogólnym', 'sprzątanie hotelu', 'pillar-page', 'A', 'B', 320, 2400,
 '["/krakow/sprzatanie-biur", "/o-firmie"]'::jsonb,
 'Edukacyjny artykuł o różnicy między dwoma rolami sprzątania w hotelu. Housekeeping (sprzątanie pokoi po wyjściu gości — własny personel hotelu lub specjalistyczna firma), sprzątanie ogólne (lobby, korytarze, restauracja, biura, fitness, spa, pralnia — często outsourcing). Reefa specjalizuje się w drugim segmencie. Wymagania: praca w godzinach minimum aktywności gości (godziny nocne), dyskrecja, znajomość procedur protokolarnych (eventy w salach konferencyjnych). Realne case studies hoteli w Krakowie. Audience: dyrektorzy hoteli planujący outsourcing.', 'manual'),

(43, 5, '5.7', 'Sprzątanie magazynu logistycznego — kontrakt długoterminowy', 'sprzątanie magazynu', 'pillar-page', 'A', 'B', 110, 2300,
 '["/krakow/sprzatanie-biurowcow", "/krakow/mycie-hal-garazowych"]'::jsonb,
 'Specjalistyczny artykuł o sprzątaniu magazynów wysokiego składowania (Centra logistyczne pod Krakowem — Targowisko, Niepołomice, Skawina). Specyfika: bardzo duże powierzchnie (10 000-100 000 m²), specjalistyczne wymagania (palety, regały do 12m wysokości, pył kartonowy), praca z wózkami widłowymi (BHP). Sprzęt: maszyny szorująco-zbierające o pojemności 200-400l, polerki, myjki ciśnieniowe. Realne stawki: 1,5-3 zł/m² miesięcznie dla podstawowego pakietu. Cykle dobowe (pracujemy w nocy lub między zmianami). Audience: dyrektorzy logistyki.', 'manual'),

(44, 5, '5.8', 'Sprzątanie restauracji — procedury HACCP w praktyce', 'sprzątanie restauracji haccp', 'how-to-guide', 'A,B', 'B', 170, 2200,
 '["/krakow/sprzatanie-biur"]'::jsonb,
 'Specjalistyczny przewodnik dla restauracji i punktów gastronomicznych. HACCP (Hazard Analysis and Critical Control Points) — co konkretnie wymaga w sprzątaniu: kuchnia (codzienne mycie blatów, sanepidu codzienne dezynfekcje stref przygotowania, tygodniowe mycie głębokich okapów), strefa gości (po każdym serwisie, codzienne pełne sprzątanie), sanitariaty (co 2-3h w czasie pracy), magazyn (cotygodniowe). Środki: spożywczo bezpieczne (Diversey Suma, Tana Tanex Food), tylko po wypłukaniu. Czas pracy: po zamknięciu restauracji. Audience: właściciele małych restauracji.', 'manual'),

(45, 5, '5.9', 'Sprzątanie laboratorium diagnostycznego — wymogi GLP/GMP', 'sprzątanie laboratorium', 'pillar-page', 'A', 'B', 50, 2400,
 '["/krakow/sprzatanie-placowek-medycznych"]'::jsonb,
 'Wysokospecjalistyczny artykuł o sprzątaniu laboratoriów diagnostycznych i naukowych. GLP (Good Laboratory Practice) i GMP (Good Manufacturing Practice) — co konkretnie wymagają: kontrolowane środowisko, tylko atestowane środki (sterylne dla niektórych stref), procedury specjalne dla pomieszczeń BSL-1/2/3, dokumentacja każdej czynności. Nie każda firma sprzątająca może obsługiwać laboratorium — wymagane szkolenia personelu, badania okresowe, certyfikaty. Realne placówki w Krakowie: Diagnostyka, ALAB, Synevo, lokalne diagnostyczne. Audience: dyrektorzy laboratoriów.', 'manual'),

(46, 5, '5.10', 'Sprzątanie centrum konferencyjnego — eventy w MCK i ICE Kraków', 'sprzątanie centrum konferencyjnego', 'pillar-page', 'A', 'B', 30, 2200,
 '["/krakow/sprzatanie-biur", "/katowice/sprzatanie-biur"]'::jsonb,
 'Specjalistyczny artykuł o sprzątaniu centrów konferencyjnych w Krakowie i Katowicach. Krakow: ICE Kraków, Auditorium Maximum UJ, Hotel Hilton Garden Inn. Katowice: Międzynarodowe Centrum Kongresowe (MCK), Spodek (eventy sportowe i konferencyjne). Specyfika: praca w trybie eventowym (przygotowanie obiektu w noc przed, sprzątanie po każdej przerwie, finalne po zakończeniu), praca pod presją czasu, koordynacja z catteringiem. Realne stawki: event 500 osób = 4-8 osób ekipy, 3-5 godzin. Audience: koordynatorzy eventów.', 'manual'),

(47, 5, '5.11', 'Sprzątanie spółdzielni mieszkaniowej — różnica w stosunku do wspólnoty', 'sprzątanie spółdzielni mieszkaniowej', 'comparison', 'C', 'B', 110, 2200,
 '["/krakow/sprzatanie-blokow", "/krakow/sprzatanie-dla-wspolnot-mieszkaniowych"]'::jsonb,
 'Comparison między dwoma formami zarządzania nieruchomościami. Spółdzielnia mieszkaniowa (zarząd spółdzielni, członkowie, regularna walna, większy obszar zarządzania — często kilka osiedli) vs wspólnota mieszkaniowa (zarząd wspólnoty, indywidualni właściciele, jeden obiekt). Różnice w sprzątaniu: skalа kontraktów (spółdzielnia często kilkadziesiąt obiektów), formuła rozliczenia (faktura kwartalna), procedury podpisywania umów (w spółdzielni przez zarząd). Reefa współpracuje z największymi spółdzielniami w Krakowie i Aglomeracji Śląskiej. Audience: członkowie zarządów.', 'manual'),

(48, 5, '5.12', 'Sprzątanie po stancji studenckiej — porównanie z prywatnym mieszkaniem', 'sprzątanie po stancji', 'comparison', 'B', 'B', 90, 2000,
 '["/krakow/sprzatanie-po-remoncie", "/krakow/cennik"]'::jsonb,
 'Comparison artykuł dla właścicieli mieszkań pod stancje studenckie. Specyfika końca semestru/roku: większe natężenie zabrudzeń (alkohol, jedzenie, kosmetyki, włosy), zniszczenia (przypalone blaty, plamy na meblach, rozdarte zasłony). Różnica między sprzątaniem standardowym a po-stancyjnym: dodatkowo czyszczenie tapicerek, polerowanie podłóg, dezynfekcja, deodoryzacja, mycie okien, drobne reperacje. Realne stawki dla 50m² stancji: 600-1200 zł vs 350-600 zł dla zwykłego sprzątania. Audience: właściciele mieszkań pod inwestycję.', 'manual'),

(49, 5, '5.13', 'Sprzątanie biblioteki i czytelni — środki bezpieczne dla książek', 'sprzątanie biblioteki', 'how-to-guide', 'A', 'B', 30, 2000,
 '["/krakow/sprzatanie-placowek-szkolnych", "/krakow/sprzatanie-biur"]'::jsonb,
 'Specjalistyczny artykuł o sprzątaniu obiektów z dużymi zbiorami książek (biblioteki publiczne, uniwersyteckie, archiwy). Wyzwania: pył książkowy (alergeny), wilgoć (ryzyko grzybów na papierze), nie wolno używać agresywnych chemicznych środków (ryzyko utleniania), klimat (kontrolowana temperatura i wilgotność). Procedury: codzienne odkurzanie wykładzin, tygodniowe wycieranie półek bez zbliżania się do książek, miesięczne pełne sprzątanie z konsultacją bibliotekarza. Konkretne placówki w Krakowie: BJ UJ, BG AGH, Biblioteka Wojewódzka. Audience: dyrektorzy bibliotek.', 'manual'),

(50, 5, '5.14', 'Sprzątanie po wymianie instalacji — skala zabrudzenia, narzędzia', 'sprzątanie po wymianie instalacji', 'how-to-guide', 'A,B', 'C', 30, 2000,
 '["/krakow/sprzatanie-po-remoncie", "/katowice/sprzatanie-po-remoncie"]'::jsonb,
 'Specjalistyczny artykuł o sprzątaniu po pracach instalacyjnych (wymiana hydrauliki, elektryki, instalacji gazowej, klimatyzacji). Skala zabrudzenia: pył gipsowy ze ścian, smary z rur, drobne fragmenty kabli, opiłki metalu. Narzędzia: odkurzacz przemysłowy z filtrem HEPA (drobiny metalu), magnesy do zbierania zaginionych śrub, mopy parowe na podłogi. Czas: mieszkanie 50m² po wymianie elektryki = 4-6h, biuro 200m² po klimatyzacji = 1 dzień ekipa 2-3 osoby. Realne stawki 2026. Audience: właściciele po remoncie częściowym.', 'manual');
