-- ============================================================
-- Importación de clientes histórico "YO CRECI DIARIO PALMERAS 2025"
-- 5574 clientes únicos · 2031 con evaluaciones > 0
-- Idempotente: usa ON CONFLICT DO NOTHING sobre (empresa_id, nombre normalizado)
-- Los créditos se cargan como ENTRADA con origen='ajuste_manual' y observación 'Migración histórica'
-- ============================================================

DO $mig$
DECLARE
  v_empresa_id uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM pronimerp.sucursales
  WHERE es_principal = true
  LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No hay sucursal Principal (es_principal=true). Abortando.';
  END IF;

  -- Marcador para skip clientes ya importados
  CREATE TEMP TABLE IF NOT EXISTS tmp_import_clientes (
    nombre_key text PRIMARY KEY,
    cliente_id uuid,
    evaluaciones numeric(14,2)
  ) ON COMMIT DROP;


  -- Chunk 1: filas 1..500
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Aadrian Basedaeu',
      '0981168118',
      NULL,
      'aadrian basedaeu'
    ),
    (
      v_empresa_id,
      'Abel Cardozo',
      '0984476782',
      NULL,
      'abel cardozo'
    ),
    (
      v_empresa_id,
      'Abigail Acuna',
      '0982418445',
      '10mil',
      'abigail acuna'
    ),
    (
      v_empresa_id,
      'Abigail Amarilla',
      '0971987584',
      NULL,
      'abigail amarilla'
    ),
    (
      v_empresa_id,
      'Abigail Arrua',
      '0985121030',
      NULL,
      'abigail arrua'
    ),
    (
      v_empresa_id,
      'Abigail Cella',
      '0972643355',
      NULL,
      'abigail cella'
    ),
    (
      v_empresa_id,
      'Abigail Escobarq',
      '0982934476',
      NULL,
      'abigail escobarq'
    ),
    (
      v_empresa_id,
      'Abigail Pando',
      '0983334713',
      NULL,
      'abigail pando'
    ),
    (
      v_empresa_id,
      'Abigail Pinedo',
      '0986564297',
      '10MIL',
      'abigail pinedo'
    ),
    (
      v_empresa_id,
      'Abigail Ramirez',
      '0985855023',
      NULL,
      'abigail ramirez'
    ),
    (
      v_empresa_id,
      'Abigaila Jara',
      '0981875554',
      NULL,
      'abigaila jara'
    ),
    (
      v_empresa_id,
      'Abril Arzamendia',
      '0983385400',
      NULL,
      'abril arzamendia'
    ),
    (
      v_empresa_id,
      'Abril Jara',
      '0982857819',
      NULL,
      'abril jara'
    ),
    (
      v_empresa_id,
      'Abugail Gomez',
      '0991635258',
      NULL,
      'abugail gomez'
    ),
    (
      v_empresa_id,
      'Ada Aguilera',
      '0972559894',
      NULL,
      'ada aguilera'
    ),
    (
      v_empresa_id,
      'Ada Alvares',
      '0982787377',
      NULL,
      'ada alvares'
    ),
    (
      v_empresa_id,
      'Ada Ayala',
      '0984249879',
      NULL,
      'ada ayala'
    ),
    (
      v_empresa_id,
      'Ada Barrios',
      '0983445952',
      NULL,
      'ada barrios'
    ),
    (
      v_empresa_id,
      'Ada Barua',
      '0992855576',
      NULL,
      'ada barua'
    ),
    (
      v_empresa_id,
      'Ada Cristaldo',
      '0984600639',
      '10MIL',
      'ada cristaldo'
    ),
    (
      v_empresa_id,
      'Ada Diaz',
      '0986879603',
      NULL,
      'ada diaz'
    ),
    (
      v_empresa_id,
      'Ada Fleitas',
      '0984306461',
      '10mil',
      'ada fleitas'
    ),
    (
      v_empresa_id,
      'Ada Gomez',
      '0985523744',
      NULL,
      'ada gomez'
    ),
    (
      v_empresa_id,
      'Ada Ibarrola',
      '0971279039',
      NULL,
      'ada ibarrola'
    ),
    (
      v_empresa_id,
      'Ada Luica',
      '0986879603',
      NULL,
      'ada luica'
    ),
    (
      v_empresa_id,
      'Ada Medina',
      '0983127286',
      NULL,
      'ada medina'
    ),
    (
      v_empresa_id,
      'Ada Rojas',
      '0982786511',
      NULL,
      'ada rojas'
    ),
    (
      v_empresa_id,
      'Adalis Vera',
      '0972281284',
      NULL,
      'adalis vera'
    ),
    (
      v_empresa_id,
      'Addriana Garcia',
      '0984297534',
      NULL,
      'addriana garcia'
    ),
    (
      v_empresa_id,
      'Adedailada Gimenez',
      '0985386878',
      NULL,
      'adedailada gimenez'
    ),
    (
      v_empresa_id,
      'Adela Torres',
      '0986747138',
      NULL,
      'adela torres'
    ),
    (
      v_empresa_id,
      'Adi Barrios',
      '0971335970',
      '10MIL',
      'adi barrios'
    ),
    (
      v_empresa_id,
      'Adiana Zarza',
      '0985157165',
      '1 selo (2)',
      'adiana zarza'
    ),
    (
      v_empresa_id,
      'Adolfo Vera',
      '0983460121',
      NULL,
      'adolfo vera'
    ),
    (
      v_empresa_id,
      'Adraiana Cabrera',
      '0983601073',
      NULL,
      'adraiana cabrera'
    ),
    (
      v_empresa_id,
      'Adraiana Gonzalez',
      '0981844632',
      NULL,
      'adraiana gonzalez'
    ),
    (
      v_empresa_id,
      'Adri Berthomier',
      '0986400426',
      NULL,
      'adri berthomier'
    ),
    (
      v_empresa_id,
      'Adri Zarza',
      '0985157165',
      NULL,
      'adri zarza'
    ),
    (
      v_empresa_id,
      'Adriana Aguilera',
      '871988080',
      NULL,
      'adriana aguilera'
    ),
    (
      v_empresa_id,
      'Adriana Almada',
      '0994599267',
      NULL,
      'adriana almada'
    ),
    (
      v_empresa_id,
      'Adriana Alviso',
      '0985920947',
      NULL,
      'adriana alviso'
    ),
    (
      v_empresa_id,
      'Adriana Ayala',
      '0994707688',
      NULL,
      'adriana ayala'
    ),
    (
      v_empresa_id,
      'Adriana Bareiro',
      '0992817471',
      NULL,
      'adriana bareiro'
    ),
    (
      v_empresa_id,
      'Adriana Basedaeu',
      '0981168118',
      NULL,
      'adriana basedaeu'
    ),
    (
      v_empresa_id,
      'Adriana Bauman',
      '0984179404',
      NULL,
      'adriana bauman'
    ),
    (
      v_empresa_id,
      'Adriana Bazquez',
      '0992740900',
      NULL,
      'adriana bazquez'
    ),
    (
      v_empresa_id,
      'Adriana Benitez',
      '0986243657',
      NULL,
      'adriana benitez'
    ),
    (
      v_empresa_id,
      'Adriana Bernal',
      '0994452364',
      '10mil',
      'adriana bernal'
    ),
    (
      v_empresa_id,
      'Adriana Bianconi',
      '0981316505',
      NULL,
      'adriana bianconi'
    ),
    (
      v_empresa_id,
      'Adriana Castineira',
      '0972123842',
      NULL,
      'adriana castineira'
    ),
    (
      v_empresa_id,
      'Adriana Duarte',
      '0985893657',
      NULL,
      'adriana duarte'
    ),
    (
      v_empresa_id,
      'Adriana Elizabeth',
      '0985157175',
      '1 selo (1)',
      'adriana elizabeth'
    ),
    (
      v_empresa_id,
      'Adriana Escobar',
      '0986427368',
      NULL,
      'adriana escobar'
    ),
    (
      v_empresa_id,
      'Adriana Ferreira',
      '0973567856',
      NULL,
      'adriana ferreira'
    ),
    (
      v_empresa_id,
      'Adriana Fleitas',
      '0986674555',
      NULL,
      'adriana fleitas'
    ),
    (
      v_empresa_id,
      'Adriana Franco',
      '0982494109',
      NULL,
      'adriana franco'
    ),
    (
      v_empresa_id,
      'Adriana Galloso',
      '0962040022',
      NULL,
      'adriana galloso'
    ),
    (
      v_empresa_id,
      'Adriana Gimenez',
      '0992735844',
      '30MIL',
      'adriana gimenez'
    ),
    (
      v_empresa_id,
      'Adriana Gomez',
      '0991732388',
      NULL,
      'adriana gomez'
    ),
    (
      v_empresa_id,
      'Adriana Gonzalez',
      '0981844632',
      NULL,
      'adriana gonzalez'
    ),
    (
      v_empresa_id,
      'Adriana Leguizamon',
      '0972161540',
      NULL,
      'adriana leguizamon'
    ),
    (
      v_empresa_id,
      'Adriana Lezcano',
      '0976474170',
      NULL,
      'adriana lezcano'
    ),
    (
      v_empresa_id,
      'Adriana Lopez',
      '0981362134',
      NULL,
      'adriana lopez'
    ),
    (
      v_empresa_id,
      'Adriana Martinez',
      '0985296970',
      NULL,
      'adriana martinez'
    ),
    (
      v_empresa_id,
      'Adriana Mendieta',
      '0974100688',
      '20mil',
      'adriana mendieta'
    ),
    (
      v_empresa_id,
      'Adriana Ortiz',
      '0984530436',
      NULL,
      'adriana ortiz'
    ),
    (
      v_empresa_id,
      'Adriana Parza',
      '0981364685',
      NULL,
      'adriana parza'
    ),
    (
      v_empresa_id,
      'Adriana Peralta',
      '0994496749',
      NULL,
      'adriana peralta'
    ),
    (
      v_empresa_id,
      'Adriana Quinonez',
      '0971970629',
      '1 selo (1)',
      'adriana quinonez'
    ),
    (
      v_empresa_id,
      'Adriana Rivas',
      '0991214189',
      NULL,
      'adriana rivas'
    ),
    (
      v_empresa_id,
      'Adriana Riveros',
      '0961302608',
      NULL,
      'adriana riveros'
    ),
    (
      v_empresa_id,
      'Adriana Rodriguez',
      '0982847079',
      '10mil',
      'adriana rodriguez'
    ),
    (
      v_empresa_id,
      'Adriana Sanchez',
      '0971353526',
      NULL,
      'adriana sanchez'
    ),
    (
      v_empresa_id,
      'Adriana Vallovera',
      '0981106473',
      '1 selo (1)',
      'adriana vallovera'
    ),
    (
      v_empresa_id,
      'Adriana Velazquez',
      '0984370817',
      NULL,
      'adriana velazquez'
    ),
    (
      v_empresa_id,
      'Adriana Villagra',
      '0983276467',
      '1 selo (1)',
      'adriana villagra'
    ),
    (
      v_empresa_id,
      'Adriana Villalba',
      '0971725588',
      NULL,
      'adriana villalba'
    ),
    (
      v_empresa_id,
      'Adriana Viveros',
      '0985800660',
      NULL,
      'adriana viveros'
    ),
    (
      v_empresa_id,
      'Adriana Zalazar',
      '0986891515',
      NULL,
      'adriana zalazar'
    ),
    (
      v_empresa_id,
      'Adriana Zamudri',
      '0991250438',
      NULL,
      'adriana zamudri'
    ),
    (
      v_empresa_id,
      'Adriana Zanotti',
      '0981437579',
      NULL,
      'adriana zanotti'
    ),
    (
      v_empresa_id,
      'Adriana Zarsa',
      '0985157185',
      NULL,
      'adriana zarsa'
    ),
    (
      v_empresa_id,
      'Aejandra Peralta',
      '0981461644',
      NULL,
      'aejandra peralta'
    ),
    (
      v_empresa_id,
      'Agata Salinas',
      '0986614340',
      NULL,
      'agata salinas'
    ),
    (
      v_empresa_id,
      'agogos',
      NULL,
      NULL,
      'agogos'
    ),
    (
      v_empresa_id,
      'Agueda Miranda',
      '0982124365',
      NULL,
      'agueda miranda'
    ),
    (
      v_empresa_id,
      'Agustin Nogues',
      '0982137507',
      NULL,
      'agustin nogues'
    ),
    (
      v_empresa_id,
      'Agustina Bustos',
      '0992221194',
      NULL,
      'agustina bustos'
    ),
    (
      v_empresa_id,
      'Agustina Fernandez',
      '0983503684',
      NULL,
      'agustina fernandez'
    ),
    (
      v_empresa_id,
      'Agustina Pino',
      '1135080808',
      NULL,
      'agustina pino'
    ),
    (
      v_empresa_id,
      'Agustina Recalde',
      '0986129799',
      NULL,
      'agustina recalde'
    ),
    (
      v_empresa_id,
      'Agustina Trinidad',
      '0992205809',
      NULL,
      'agustina trinidad'
    ),
    (
      v_empresa_id,
      'Agustina Vallovera',
      '0986364344',
      NULL,
      'agustina vallovera'
    ),
    (
      v_empresa_id,
      'Agusto Ayala',
      '0984573458',
      NULL,
      'agusto ayala'
    ),
    (
      v_empresa_id,
      'Ahiana Barboza',
      '0982828200',
      '10mil',
      'ahiana barboza'
    ),
    (
      v_empresa_id,
      'Ahylen Leitan',
      '0986514601',
      NULL,
      'ahylen leitan'
    ),
    (
      v_empresa_id,
      'Aida Curbalan',
      '0986188584',
      NULL,
      'aida curbalan'
    ),
    (
      v_empresa_id,
      'Aida Devan',
      '0984835739',
      NULL,
      'aida devan'
    ),
    (
      v_empresa_id,
      'Aida Dominguez',
      '99466370',
      NULL,
      'aida dominguez'
    ),
    (
      v_empresa_id,
      'Aida Figueredo',
      '0981241619',
      NULL,
      'aida figueredo'
    ),
    (
      v_empresa_id,
      'Aida Paola Barairo',
      '0991979620',
      '10mil',
      'aida paola barairo'
    ),
    (
      v_empresa_id,
      'Aida Prieto',
      '0981511541',
      '30mil',
      'aida prieto'
    ),
    (
      v_empresa_id,
      'Aida Rojas',
      '0972207907',
      '30MIL',
      'aida rojas'
    ),
    (
      v_empresa_id,
      'Aida Veloso',
      '0986578308',
      NULL,
      'aida veloso'
    ),
    (
      v_empresa_id,
      'Aide Benitez',
      '0982421337',
      NULL,
      'aide benitez'
    ),
    (
      v_empresa_id,
      'Aide Gomez',
      '0981628967',
      NULL,
      'aide gomez'
    ),
    (
      v_empresa_id,
      'Aileen Cortazar',
      '0983594046',
      NULL,
      'aileen cortazar'
    ),
    (
      v_empresa_id,
      'Ailen Vargas',
      '0981998282',
      NULL,
      'ailen vargas'
    ),
    (
      v_empresa_id,
      'Ailyn Badan',
      '0971939409',
      NULL,
      'ailyn badan'
    ),
    (
      v_empresa_id,
      'Ala Ayala',
      '0981423730',
      NULL,
      'ala ayala'
    ),
    (
      v_empresa_id,
      'Alan Gaston',
      '0972549580',
      NULL,
      'alan gaston'
    ),
    (
      v_empresa_id,
      'Alan Ledezma',
      '0981853702',
      NULL,
      'alan ledezma'
    ),
    (
      v_empresa_id,
      'Alan Parrientos',
      '0971759441',
      NULL,
      'alan parrientos'
    ),
    (
      v_empresa_id,
      'Alana Santacruz',
      '0984404307',
      NULL,
      'alana santacruz'
    ),
    (
      v_empresa_id,
      'Alanis Vera',
      '0991436442',
      NULL,
      'alanis vera'
    ),
    (
      v_empresa_id,
      'Alba Ayala',
      '0971719819',
      NULL,
      'alba ayala'
    ),
    (
      v_empresa_id,
      'Alba Benitez',
      '0992743619',
      NULL,
      'alba benitez'
    ),
    (
      v_empresa_id,
      'Alba Colman',
      '0994602992',
      '10MIL',
      'alba colman'
    ),
    (
      v_empresa_id,
      'Alba Contrera',
      '0972476582',
      '30mil',
      'alba contrera'
    ),
    (
      v_empresa_id,
      'Alba Fernandez',
      '0981361964',
      NULL,
      'alba fernandez'
    ),
    (
      v_empresa_id,
      'Alba Rojas',
      '0984408100',
      '1 selo (1)',
      'alba rojas'
    ),
    (
      v_empresa_id,
      'Alba Vera',
      '0982978441',
      NULL,
      'alba vera'
    ),
    (
      v_empresa_id,
      'Alba Zayas',
      '0985727750',
      '10mil',
      'alba zayas'
    ),
    (
      v_empresa_id,
      'Alba Zorrilla',
      '0982819690',
      NULL,
      'alba zorrilla'
    ),
    (
      v_empresa_id,
      'Albert Driedger Neufeld',
      NULL,
      NULL,
      'albert driedger neufeld'
    ),
    (
      v_empresa_id,
      'Albert Klippenstein',
      '0972122832',
      NULL,
      'albert klippenstein'
    ),
    (
      v_empresa_id,
      'Alberta Fernandez',
      '0992761987',
      NULL,
      'alberta fernandez'
    ),
    (
      v_empresa_id,
      'Alberto Ortiz',
      '0984870488',
      NULL,
      'alberto ortiz'
    ),
    (
      v_empresa_id,
      'Albina Maldonado',
      '84333391',
      NULL,
      'albina maldonado'
    ),
    (
      v_empresa_id,
      'Albina Oviedo',
      '0982721134',
      NULL,
      'albina oviedo'
    ),
    (
      v_empresa_id,
      'Alcira Fretes',
      '0983671635',
      NULL,
      'alcira fretes'
    ),
    (
      v_empresa_id,
      'Aldana Cartelle',
      '0971505278',
      NULL,
      'aldana cartelle'
    ),
    (
      v_empresa_id,
      'Aldo Acosta',
      '0994415515',
      '10mil',
      'aldo acosta'
    ),
    (
      v_empresa_id,
      'Aldo Bujol',
      '0991552900',
      NULL,
      'aldo bujol'
    ),
    (
      v_empresa_id,
      'Aldo Colman',
      '0992922018',
      NULL,
      'aldo colman'
    ),
    (
      v_empresa_id,
      'Aldo Mercado',
      '0984975823',
      NULL,
      'aldo mercado'
    ),
    (
      v_empresa_id,
      'Ale',
      '0985525801',
      NULL,
      'ale'
    ),
    (
      v_empresa_id,
      'Ale (Bru)',
      NULL,
      NULL,
      'ale (bru)'
    ),
    (
      v_empresa_id,
      'Ale Bru',
      NULL,
      NULL,
      'ale bru'
    ),
    (
      v_empresa_id,
      'Ale Bruna',
      NULL,
      NULL,
      'ale bruna'
    ),
    (
      v_empresa_id,
      'Ale Demestri',
      '0985525801',
      NULL,
      'ale demestri'
    ),
    (
      v_empresa_id,
      'Ale Rolon',
      '0985525801',
      NULL,
      'ale rolon'
    ),
    (
      v_empresa_id,
      'Aleandra Avila',
      '0985530639',
      NULL,
      'aleandra avila'
    ),
    (
      v_empresa_id,
      'Alecia Valbuena',
      '0986493368',
      NULL,
      'alecia valbuena'
    ),
    (
      v_empresa_id,
      'Alee',
      NULL,
      NULL,
      'alee'
    ),
    (
      v_empresa_id,
      'Aleide Bordon',
      '0983723341',
      '20MIL',
      'aleide bordon'
    ),
    (
      v_empresa_id,
      'Alejandra Acosta',
      '0985209812',
      '1 selo (2)',
      'alejandra acosta'
    ),
    (
      v_empresa_id,
      'Alejandra Aguiar',
      '0984515352',
      NULL,
      'alejandra aguiar'
    ),
    (
      v_empresa_id,
      'Alejandra Arcia',
      '0982804350',
      '10mil',
      'alejandra arcia'
    ),
    (
      v_empresa_id,
      'Alejandra Baez',
      '0992061931',
      NULL,
      'alejandra baez'
    ),
    (
      v_empresa_id,
      'Alejandra Bareiro',
      '0991851691',
      NULL,
      'alejandra bareiro'
    ),
    (
      v_empresa_id,
      'Alejandra Barrios',
      '0981224102',
      NULL,
      'alejandra barrios'
    ),
    (
      v_empresa_id,
      'Alejandra Cabanas',
      '0981408717',
      NULL,
      'alejandra cabanas'
    ),
    (
      v_empresa_id,
      'Alejandra Corna',
      '0985593653',
      NULL,
      'alejandra corna'
    ),
    (
      v_empresa_id,
      'Alejandra Encina',
      '0992502051',
      NULL,
      'alejandra encina'
    ),
    (
      v_empresa_id,
      'Alejandra Flecha',
      '0981852118',
      NULL,
      'alejandra flecha'
    ),
    (
      v_empresa_id,
      'Alejandra Galeano',
      '0972373358',
      NULL,
      'alejandra galeano'
    ),
    (
      v_empresa_id,
      'Alejandra Garay',
      '0986717356',
      NULL,
      'alejandra garay'
    ),
    (
      v_empresa_id,
      'Alejandra Garcia',
      '0972259236',
      NULL,
      'alejandra garcia'
    ),
    (
      v_empresa_id,
      'Alejandra Garin',
      '0981934004',
      '10mil',
      'alejandra garin'
    ),
    (
      v_empresa_id,
      'Alejandra Gomez',
      '0981523018',
      NULL,
      'alejandra gomez'
    ),
    (
      v_empresa_id,
      'Alejandra Insauralde',
      '0986917048',
      NULL,
      'alejandra insauralde'
    ),
    (
      v_empresa_id,
      'Alejandra Lovera',
      '0984225574',
      '20MIL',
      'alejandra lovera'
    ),
    (
      v_empresa_id,
      'Alejandra Maciel',
      '0981543780',
      NULL,
      'alejandra maciel'
    ),
    (
      v_empresa_id,
      'Alejandra Maidana',
      '0972213197',
      NULL,
      'alejandra maidana'
    ),
    (
      v_empresa_id,
      'Alejandra Malgarejo',
      '0985112999',
      '30MIL',
      'alejandra malgarejo'
    ),
    (
      v_empresa_id,
      'Alejandra Martinez',
      '0984916479',
      NULL,
      'alejandra martinez'
    ),
    (
      v_empresa_id,
      'Alejandra Medina',
      '0981956844',
      '1 selo (2)',
      'alejandra medina'
    ),
    (
      v_empresa_id,
      'Alejandra Montenegro',
      NULL,
      NULL,
      'alejandra montenegro'
    ),
    (
      v_empresa_id,
      'Alejandra Obrego',
      '0994761923',
      NULL,
      'alejandra obrego'
    ),
    (
      v_empresa_id,
      'Alejandra Paredes',
      '0981840949',
      NULL,
      'alejandra paredes'
    ),
    (
      v_empresa_id,
      'Alejandra Patina',
      '0982755664',
      NULL,
      'alejandra patina'
    ),
    (
      v_empresa_id,
      'Alejandra Ramos',
      '0976753707',
      NULL,
      'alejandra ramos'
    ),
    (
      v_empresa_id,
      'Alejandra Salazar',
      '0986378762',
      NULL,
      'alejandra salazar'
    ),
    (
      v_empresa_id,
      'Alejandra Servin',
      '0983456976',
      '10mil',
      'alejandra servin'
    ),
    (
      v_empresa_id,
      'Alejandra Valdez',
      '0982416794',
      NULL,
      'alejandra valdez'
    ),
    (
      v_empresa_id,
      'Alejandra Valdovinos',
      '0981737363',
      NULL,
      'alejandra valdovinos'
    ),
    (
      v_empresa_id,
      'Alejandra Vega Ortiz',
      '0982802079',
      NULL,
      'alejandra vega ortiz'
    ),
    (
      v_empresa_id,
      'Alejandra Verza',
      '0984923325',
      NULL,
      'alejandra verza'
    ),
    (
      v_empresa_id,
      'Alejandra Wrede',
      '0982440191',
      NULL,
      'alejandra wrede'
    ),
    (
      v_empresa_id,
      'Alejandro Areco',
      '0986343361',
      NULL,
      'alejandro areco'
    ),
    (
      v_empresa_id,
      'Alejandro Delgado',
      '0971612179',
      NULL,
      'alejandro delgado'
    ),
    (
      v_empresa_id,
      'Alejandro Martinez',
      '0991712618',
      NULL,
      'alejandro martinez'
    ),
    (
      v_empresa_id,
      'Alejandro Mosqueda',
      '0986298788',
      NULL,
      'alejandro mosqueda'
    ),
    (
      v_empresa_id,
      'Alejandro Peralba',
      '0982805034',
      NULL,
      'alejandro peralba'
    ),
    (
      v_empresa_id,
      'Alejandro Rodriguez',
      '0971252343',
      NULL,
      'alejandro rodriguez'
    ),
    (
      v_empresa_id,
      'Alejandro Stickll',
      '0994169219',
      NULL,
      'alejandro stickll'
    ),
    (
      v_empresa_id,
      'Aleli Jara',
      '0971173179',
      '10MIL',
      'aleli jara'
    ),
    (
      v_empresa_id,
      'Aleli Peralta',
      '0981200981',
      NULL,
      'aleli peralta'
    ),
    (
      v_empresa_id,
      'Alesia Rivarola',
      '0981507315',
      NULL,
      'alesia rivarola'
    ),
    (
      v_empresa_id,
      'Alessandra Garcete',
      '0981929091',
      NULL,
      'alessandra garcete'
    ),
    (
      v_empresa_id,
      'Alex Candia',
      '0986893685',
      '10mil',
      'alex candia'
    ),
    (
      v_empresa_id,
      'Alexa Benitez',
      '0991411824',
      NULL,
      'alexa benitez'
    ),
    (
      v_empresa_id,
      'Alexander Centurion',
      '0986588257',
      '10mil',
      'alexander centurion'
    ),
    (
      v_empresa_id,
      'Alexander Van Der Pol',
      '0986637132',
      NULL,
      'alexander van der pol'
    ),
    (
      v_empresa_id,
      'Alexandra',
      '0976537892',
      NULL,
      'alexandra'
    ),
    (
      v_empresa_id,
      'Alexandra Acevedo',
      '0992817113',
      NULL,
      'alexandra acevedo'
    ),
    (
      v_empresa_id,
      'Alexandra Acosta',
      '0971150749',
      NULL,
      'alexandra acosta'
    ),
    (
      v_empresa_id,
      'Alexandra Armadans',
      '0981101080',
      NULL,
      'alexandra armadans'
    ),
    (
      v_empresa_id,
      'Alexandra Astorga',
      '0976935961',
      NULL,
      'alexandra astorga'
    ),
    (
      v_empresa_id,
      'Alexandra Bajac',
      '0986197618',
      '20mil',
      'alexandra bajac'
    ),
    (
      v_empresa_id,
      'Alexandra Barreto',
      '0973809937',
      NULL,
      'alexandra barreto'
    ),
    (
      v_empresa_id,
      'Alexandra Barrios',
      '0981224102',
      NULL,
      'alexandra barrios'
    ),
    (
      v_empresa_id,
      'Alexandra Blanco',
      '0991468840',
      NULL,
      'alexandra blanco'
    ),
    (
      v_empresa_id,
      'Alexandra Bogarin',
      '0983997802',
      NULL,
      'alexandra bogarin'
    ),
    (
      v_empresa_id,
      'Alexandra Correa',
      '0976537892',
      NULL,
      'alexandra correa'
    ),
    (
      v_empresa_id,
      'Alexandra Davalos',
      '0984936105',
      NULL,
      'alexandra davalos'
    ),
    (
      v_empresa_id,
      'Alexandra Felip',
      '0982475100',
      NULL,
      'alexandra felip'
    ),
    (
      v_empresa_id,
      'Alexandra Leon',
      '0981200678',
      NULL,
      'alexandra leon'
    ),
    (
      v_empresa_id,
      'Alexandra Riveros',
      '0971884450',
      NULL,
      'alexandra riveros'
    ),
    (
      v_empresa_id,
      'Alexia Colman',
      '0981107702',
      NULL,
      'alexia colman'
    ),
    (
      v_empresa_id,
      'Alexia Davalos',
      '0984674154',
      '1 selo (1)',
      'alexia davalos'
    ),
    (
      v_empresa_id,
      'Alexia Diaz',
      '0991500497',
      NULL,
      'alexia diaz'
    ),
    (
      v_empresa_id,
      'Alexia Espies',
      '0981646483',
      NULL,
      'alexia espies'
    ),
    (
      v_empresa_id,
      'Alexia Martinez',
      '0982156051',
      NULL,
      'alexia martinez'
    ),
    (
      v_empresa_id,
      'Alexia Spiess',
      '0981232522',
      NULL,
      'alexia spiess'
    ),
    (
      v_empresa_id,
      'Alexia Vazquez',
      '0984353949',
      NULL,
      'alexia vazquez'
    ),
    (
      v_empresa_id,
      'Alexis Martinez',
      '0982764732',
      NULL,
      'alexis martinez'
    ),
    (
      v_empresa_id,
      'Alfred Hildebrand',
      '0971427015',
      '20MIL',
      'alfred hildebrand'
    ),
    (
      v_empresa_id,
      'Alice Cespedes',
      '0972633936',
      '10mil',
      'alice cespedes'
    ),
    (
      v_empresa_id,
      'Alice Ferreira',
      '0981700434',
      '10mil',
      'alice ferreira'
    ),
    (
      v_empresa_id,
      'Alice Lopez de Fretes',
      '0992288682',
      '1 selo (1)',
      'alice lopez de fretes'
    ),
    (
      v_empresa_id,
      'Alice Sawatzky',
      '0976369891',
      NULL,
      'alice sawatzky'
    ),
    (
      v_empresa_id,
      'Alicia Arruello',
      '0991750231',
      '30mil',
      'alicia arruello'
    ),
    (
      v_empresa_id,
      'Alicia Caballero',
      '0991432182',
      NULL,
      'alicia caballero'
    ),
    (
      v_empresa_id,
      'Alicia Escobar',
      '0971781936',
      NULL,
      'alicia escobar'
    ),
    (
      v_empresa_id,
      'Alicia Gonzalez',
      '0994484768',
      '20mil',
      'alicia gonzalez'
    ),
    (
      v_empresa_id,
      'Alicia Inafran',
      '0983896459',
      NULL,
      'alicia inafran'
    ),
    (
      v_empresa_id,
      'Alicia Mendoza',
      '0976488488',
      NULL,
      'alicia mendoza'
    ),
    (
      v_empresa_id,
      'Alicia Paez',
      '0991632871',
      NULL,
      'alicia paez'
    ),
    (
      v_empresa_id,
      'Alicia Recalde',
      '0981282989',
      '20MIL',
      'alicia recalde'
    ),
    (
      v_empresa_id,
      'Alicia Roman',
      '0976567485',
      NULL,
      'alicia roman'
    ),
    (
      v_empresa_id,
      'Alicia Saldivar',
      '0972781920',
      NULL,
      'alicia saldivar'
    ),
    (
      v_empresa_id,
      'Alicia Sanabria',
      '0986105281',
      NULL,
      'alicia sanabria'
    ),
    (
      v_empresa_id,
      'Alicia Sosa',
      '0981878585',
      NULL,
      'alicia sosa'
    ),
    (
      v_empresa_id,
      'Alicia Vazquez',
      '0981163334',
      NULL,
      'alicia vazquez'
    ),
    (
      v_empresa_id,
      'Alicia vega',
      '0982645700',
      '20mil',
      'alicia vega'
    ),
    (
      v_empresa_id,
      'Alicia Vicesar',
      '0983191981',
      NULL,
      'alicia vicesar'
    ),
    (
      v_empresa_id,
      'Alicia Vicezar',
      '0983191981',
      NULL,
      'alicia vicezar'
    ),
    (
      v_empresa_id,
      'Alida Gamarra',
      '0986109335',
      NULL,
      'alida gamarra'
    ),
    (
      v_empresa_id,
      'Alina Gamarra',
      '0971253293',
      NULL,
      'alina gamarra'
    ),
    (
      v_empresa_id,
      'Aline Britez',
      '0986423757',
      NULL,
      'aline britez'
    ),
    (
      v_empresa_id,
      'Aline Gapelatto',
      NULL,
      NULL,
      'aline gapelatto'
    ),
    (
      v_empresa_id,
      'Alisar Zein',
      '0983899999',
      NULL,
      'alisar zein'
    ),
    (
      v_empresa_id,
      'Alison Baez',
      '0971109555',
      '10MIL',
      'alison baez'
    ),
    (
      v_empresa_id,
      'Alison Guayuan',
      '0986549552',
      '10MIL',
      'alison guayuan'
    ),
    (
      v_empresa_id,
      'Alissar Zein',
      '0983899999',
      NULL,
      'alissar zein'
    ),
    (
      v_empresa_id,
      'Allison Zaracho',
      '0984697392',
      NULL,
      'allison zaracho'
    ),
    (
      v_empresa_id,
      'Alma Acosta',
      '0972667933',
      '10MIL',
      'alma acosta'
    ),
    (
      v_empresa_id,
      'Alma Alderetes',
      '0961993894',
      NULL,
      'alma alderetes'
    ),
    (
      v_empresa_id,
      'Alma Almidon',
      '0985505944',
      NULL,
      'alma almidon'
    ),
    (
      v_empresa_id,
      'Alma Almiron',
      '0985505944',
      NULL,
      'alma almiron'
    ),
    (
      v_empresa_id,
      'Alma Castillo',
      '0984872503',
      '10MIL',
      'alma castillo'
    ),
    (
      v_empresa_id,
      'Alma Ferreira',
      '0981637999',
      NULL,
      'alma ferreira'
    ),
    (
      v_empresa_id,
      'Alma Martinez',
      '0986654176',
      NULL,
      'alma martinez'
    ),
    (
      v_empresa_id,
      'Alma Rodriguez',
      '0981834994',
      NULL,
      'alma rodriguez'
    ),
    (
      v_empresa_id,
      'Amada Canata',
      '0994346290',
      NULL,
      'amada canata'
    ),
    (
      v_empresa_id,
      'Amalia Ibars',
      '0984619506',
      NULL,
      'amalia ibars'
    ),
    (
      v_empresa_id,
      'Amalia Villalba',
      '0991466814',
      NULL,
      'amalia villalba'
    ),
    (
      v_empresa_id,
      'Amanda Artiles',
      '98422062',
      NULL,
      'amanda artiles'
    ),
    (
      v_empresa_id,
      'Amanda Cardozo',
      '0971296880',
      NULL,
      'amanda cardozo'
    ),
    (
      v_empresa_id,
      'Amanda Mesa',
      '0986837355',
      NULL,
      'amanda mesa'
    ),
    (
      v_empresa_id,
      'Amanda Renal',
      '0975590815',
      NULL,
      'amanda renal'
    ),
    (
      v_empresa_id,
      'Amanda Samaniego',
      '0972710721',
      NULL,
      'amanda samaniego'
    ),
    (
      v_empresa_id,
      'Amanda Veniago',
      '75590815',
      NULL,
      'amanda veniago'
    ),
    (
      v_empresa_id,
      'Amaya Parodi',
      '0981910077',
      '1 selo (1)',
      'amaya parodi'
    ),
    (
      v_empresa_id,
      'Ambar Arar',
      '0981970630',
      NULL,
      'ambar arar'
    ),
    (
      v_empresa_id,
      'Ambar Isnardi',
      '0984583727',
      NULL,
      'ambar isnardi'
    ),
    (
      v_empresa_id,
      'Ambar Ramirez',
      '0983378933',
      '1 selo (1)',
      'ambar ramirez'
    ),
    (
      v_empresa_id,
      'Ambar Wesped',
      '0993301400',
      NULL,
      'ambar wesped'
    ),
    (
      v_empresa_id,
      'Amelia Ruiz Diaz',
      '98228095',
      NULL,
      'amelia ruiz diaz'
    ),
    (
      v_empresa_id,
      'Ammy Burifaldi',
      '0993599250',
      '1 selo (1)',
      'ammy burifaldi'
    ),
    (
      v_empresa_id,
      'Amonkay Ruiz',
      '0981763211',
      NULL,
      'amonkay ruiz'
    ),
    (
      v_empresa_id,
      'Ana Acosta',
      '0982337689',
      NULL,
      'ana acosta'
    ),
    (
      v_empresa_id,
      'Ana Acuna',
      '0982205553',
      NULL,
      'ana acuna'
    ),
    (
      v_empresa_id,
      'Ana Almada',
      '0985245544',
      NULL,
      'ana almada'
    ),
    (
      v_empresa_id,
      'Ana Alvarez',
      '0985990876',
      NULL,
      'ana alvarez'
    ),
    (
      v_empresa_id,
      'Ana Alvisa',
      '0972190773',
      NULL,
      'ana alvisa'
    ),
    (
      v_empresa_id,
      'Ana Alviso',
      '0972190773',
      NULL,
      'ana alviso'
    ),
    (
      v_empresa_id,
      'Ana Amarilla',
      '0986139784',
      '10mil',
      'ana amarilla'
    ),
    (
      v_empresa_id,
      'Ana Antunes',
      '0992685564',
      '1 selo (6)',
      'ana antunes'
    ),
    (
      v_empresa_id,
      'Ana Arce',
      '0981944344',
      NULL,
      'ana arce'
    ),
    (
      v_empresa_id,
      'Ana Arias',
      '0982578785',
      NULL,
      'ana arias'
    ),
    (
      v_empresa_id,
      'Ana Ayala',
      '0971883911',
      NULL,
      'ana ayala'
    ),
    (
      v_empresa_id,
      'Ana Baez',
      '0991716156',
      NULL,
      'ana baez'
    ),
    (
      v_empresa_id,
      'Ana Balbuena',
      '0972768885',
      '20mil',
      'ana balbuena'
    ),
    (
      v_empresa_id,
      'Ana Barquinero',
      '0991980704',
      NULL,
      'ana barquinero'
    ),
    (
      v_empresa_id,
      'Ana Belen',
      '0985259832',
      '10mil',
      'ana belen'
    ),
    (
      v_empresa_id,
      'Ana Belen Fleitaa',
      '0971913900',
      '30MIL',
      'ana belen fleitaa'
    ),
    (
      v_empresa_id,
      'Ana Belen Garcete',
      '0984182567',
      '10MIL',
      'ana belen garcete'
    ),
    (
      v_empresa_id,
      'Ana Belen Gonzalez',
      '0981322746',
      '1 selo (4)',
      'ana belen gonzalez'
    ),
    (
      v_empresa_id,
      'Ana Belen Rojas',
      '0984698678',
      NULL,
      'ana belen rojas'
    ),
    (
      v_empresa_id,
      'Ana Benitez',
      '0971673302',
      NULL,
      'ana benitez'
    ),
    (
      v_empresa_id,
      'Ana Berdejo',
      '0994205381',
      NULL,
      'ana berdejo'
    ),
    (
      v_empresa_id,
      'Ana Bogarin',
      '0974302454',
      NULL,
      'ana bogarin'
    ),
    (
      v_empresa_id,
      'Ana Bosch',
      '0982846647',
      '10mil',
      'ana bosch'
    ),
    (
      v_empresa_id,
      'Ana Caballero',
      '0994293221',
      '1 selo (1)',
      'ana caballero'
    ),
    (
      v_empresa_id,
      'Ana Cabrera',
      '0986572272',
      '10mil',
      'ana cabrera'
    ),
    (
      v_empresa_id,
      'Ana Cantero',
      '0982605109',
      NULL,
      'ana cantero'
    ),
    (
      v_empresa_id,
      'Ana Caren Rojas',
      '0991891566',
      NULL,
      'ana caren rojas'
    ),
    (
      v_empresa_id,
      'Ana Carolina Ojeda',
      '0991239266',
      NULL,
      'ana carolina ojeda'
    ),
    (
      v_empresa_id,
      'Ana Cazal',
      '0985421104',
      NULL,
      'ana cazal'
    ),
    (
      v_empresa_id,
      'Ana Colman',
      '0972575975',
      NULL,
      'ana colman'
    ),
    (
      v_empresa_id,
      'Ana Constantiini',
      '0981833835',
      NULL,
      'ana constantiini'
    ),
    (
      v_empresa_id,
      'Ana Correa',
      '0971238116',
      NULL,
      'ana correa'
    ),
    (
      v_empresa_id,
      'Ana Cristaldo',
      '0984843706',
      NULL,
      'ana cristaldo'
    ),
    (
      v_empresa_id,
      'Ana Cuquejo',
      '0981138174',
      NULL,
      'ana cuquejo'
    ),
    (
      v_empresa_id,
      'Ana Davalos',
      '0994384828',
      NULL,
      'ana davalos'
    ),
    (
      v_empresa_id,
      'Ana Domani',
      '0982943450',
      NULL,
      'ana domani'
    ),
    (
      v_empresa_id,
      'Ana Domaniczky',
      '0986636552',
      NULL,
      'ana domaniczky'
    ),
    (
      v_empresa_id,
      'Ana Domaniski',
      '0982943460',
      NULL,
      'ana domaniski'
    ),
    (
      v_empresa_id,
      'Ana Domanisque',
      '0982943450',
      NULL,
      'ana domanisque'
    ),
    (
      v_empresa_id,
      'Ana Estigarribia',
      '0971864332',
      NULL,
      'ana estigarribia'
    ),
    (
      v_empresa_id,
      'Ana Ferko',
      '0972186517',
      NULL,
      'ana ferko'
    ),
    (
      v_empresa_id,
      'Ana Fernandez',
      '0991552107',
      NULL,
      'ana fernandez'
    ),
    (
      v_empresa_id,
      'Ana Ferreira',
      '0981458949',
      NULL,
      'ana ferreira'
    ),
    (
      v_empresa_id,
      'Ana Figueredo',
      '0981479524',
      NULL,
      'ana figueredo'
    ),
    (
      v_empresa_id,
      'Ana Flecha',
      '0986320044',
      NULL,
      'ana flecha'
    ),
    (
      v_empresa_id,
      'Ana Franco',
      '0991741869',
      NULL,
      'ana franco'
    ),
    (
      v_empresa_id,
      'Ana Gabriela',
      '0981627456',
      NULL,
      'ana gabriela'
    ),
    (
      v_empresa_id,
      'Ana Gabriela Rautenberg',
      '0972900325',
      '50mil',
      'ana gabriela rautenberg'
    ),
    (
      v_empresa_id,
      'Ana Galeano',
      '0981523905',
      NULL,
      'ana galeano'
    ),
    (
      v_empresa_id,
      'Ana Garcete',
      '0986538516',
      NULL,
      'ana garcete'
    ),
    (
      v_empresa_id,
      'Ana Gomez',
      '0981244316',
      '30mil',
      'ana gomez'
    ),
    (
      v_empresa_id,
      'Ana Gonzalez',
      '0983345904',
      '20MIL',
      'ana gonzalez'
    ),
    (
      v_empresa_id,
      'Ana Jara',
      '0991677882',
      NULL,
      'ana jara'
    ),
    (
      v_empresa_id,
      'Ana Knust',
      '0981627456',
      '30mil',
      'ana knust'
    ),
    (
      v_empresa_id,
      'Ana Laura',
      '0981485391',
      NULL,
      'ana laura'
    ),
    (
      v_empresa_id,
      'Ana Ledezma',
      '0994340252',
      NULL,
      'ana ledezma'
    ),
    (
      v_empresa_id,
      'Ana Leticia Valdez',
      '0981441475',
      NULL,
      'ana leticia valdez'
    ),
    (
      v_empresa_id,
      'Ana Lia',
      '0994646617',
      NULL,
      'ana lia'
    ),
    (
      v_empresa_id,
      'Ana Lira',
      '0982559381',
      '20mil',
      'ana lira'
    ),
    (
      v_empresa_id,
      'Ana Llano',
      '0981423730',
      NULL,
      'ana llano'
    ),
    (
      v_empresa_id,
      'Ana Lopez',
      '0971850183',
      NULL,
      'ana lopez'
    ),
    (
      v_empresa_id,
      'Ana Maria Llano',
      '0981423730',
      NULL,
      'ana maria llano'
    ),
    (
      v_empresa_id,
      'Ana Martinez',
      '0982459645',
      NULL,
      'ana martinez'
    ),
    (
      v_empresa_id,
      'Ana Mendieta',
      '0981107859',
      NULL,
      'ana mendieta'
    ),
    (
      v_empresa_id,
      'Ana Merlon',
      '0971906606',
      NULL,
      'ana merlon'
    ),
    (
      v_empresa_id,
      'Ana Meyer',
      '0991207727',
      NULL,
      'ana meyer'
    ),
    (
      v_empresa_id,
      'Ana Miranda',
      '0992546513',
      NULL,
      'ana miranda'
    ),
    (
      v_empresa_id,
      'Ana Moran',
      '0986151051',
      '10mil',
      'ana moran'
    ),
    (
      v_empresa_id,
      'Ana Moreno',
      '0971640003',
      NULL,
      'ana moreno'
    ),
    (
      v_empresa_id,
      'Ana Paredes',
      '0991711133',
      NULL,
      'ana paredes'
    ),
    (
      v_empresa_id,
      'Ana Paula',
      '0982344159',
      NULL,
      'ana paula'
    ),
    (
      v_empresa_id,
      'Ana Paula Gimenez',
      '0986167908',
      NULL,
      'ana paula gimenez'
    ),
    (
      v_empresa_id,
      'Ana paula Legizan',
      '0991713126',
      NULL,
      'ana paula legizan'
    ),
    (
      v_empresa_id,
      'Ana Paula Venialgo',
      '0986582976',
      '10mil',
      'ana paula venialgo'
    ),
    (
      v_empresa_id,
      'Ana Paula Vieira',
      '0982546040',
      NULL,
      'ana paula vieira'
    ),
    (
      v_empresa_id,
      'Ana Pereira',
      '0961185047',
      NULL,
      'ana pereira'
    ),
    (
      v_empresa_id,
      'Ana Pompa',
      '0984850044',
      NULL,
      'ana pompa'
    ),
    (
      v_empresa_id,
      'Ana Quintana',
      '0982224957',
      NULL,
      'ana quintana'
    ),
    (
      v_empresa_id,
      'Ana Ramirez',
      '0972193311',
      '10mil',
      'ana ramirez'
    ),
    (
      v_empresa_id,
      'Ana Robledo',
      '0981892080',
      NULL,
      'ana robledo'
    ),
    (
      v_empresa_id,
      'Ana Rodriguez',
      '0981153902',
      '40mil',
      'ana rodriguez'
    ),
    (
      v_empresa_id,
      'Ana Rojas',
      '0976189020',
      NULL,
      'ana rojas'
    ),
    (
      v_empresa_id,
      'Ana Sabata',
      '0981451599',
      NULL,
      'ana sabata'
    ),
    (
      v_empresa_id,
      'Ana Salinas',
      '0971157796',
      NULL,
      'ana salinas'
    ),
    (
      v_empresa_id,
      'Ana Solano',
      '0983705096',
      NULL,
      'ana solano'
    ),
    (
      v_empresa_id,
      'Ana Vazquez',
      '0991966069',
      NULL,
      'ana vazquez'
    ),
    (
      v_empresa_id,
      'Ana Vegini',
      '0982159507',
      NULL,
      'ana vegini'
    ),
    (
      v_empresa_id,
      'Ana Victoria',
      '0981294009',
      NULL,
      'ana victoria'
    ),
    (
      v_empresa_id,
      'Ana Victoria Carrera',
      '0982102800',
      '40MIL',
      'ana victoria carrera'
    ),
    (
      v_empresa_id,
      'Ana Villalba',
      '0986588598',
      '10MIL',
      'ana villalba'
    ),
    (
      v_empresa_id,
      'Ana Zarza',
      '0971579544',
      NULL,
      'ana zarza'
    ),
    (
      v_empresa_id,
      'Anabella Ortiz',
      '0985415329',
      '1 selo (1)',
      'anabella ortiz'
    ),
    (
      v_empresa_id,
      'Anahi Gill',
      '0982774321',
      NULL,
      'anahi gill'
    ),
    (
      v_empresa_id,
      'Anahi Gonzalez',
      '0984054150',
      NULL,
      'anahi gonzalez'
    ),
    (
      v_empresa_id,
      'Anahi Ledesma',
      '0972186059',
      NULL,
      'anahi ledesma'
    ),
    (
      v_empresa_id,
      'Anahi Moreira',
      '0986290137',
      NULL,
      'anahi moreira'
    ),
    (
      v_empresa_id,
      'Anahi Ovelar',
      '0982349666',
      NULL,
      'anahi ovelar'
    ),
    (
      v_empresa_id,
      'Anahi Rodriguez',
      '0984589205',
      NULL,
      'anahi rodriguez'
    ),
    (
      v_empresa_id,
      'Anahi Rojas',
      '0974818777',
      '30MIL',
      'anahi rojas'
    ),
    (
      v_empresa_id,
      'Anahi Sanguina',
      '0982469915',
      NULL,
      'anahi sanguina'
    ),
    (
      v_empresa_id,
      'Analia Benitez',
      '0991297311',
      '10mil',
      'analia benitez'
    ),
    (
      v_empresa_id,
      'Analia Bracho',
      '0981513941',
      NULL,
      'analia bracho'
    ),
    (
      v_empresa_id,
      'Analia Enciso',
      '0976650915',
      NULL,
      'analia enciso'
    ),
    (
      v_empresa_id,
      'Analia Fernandez',
      '0972979171',
      NULL,
      'analia fernandez'
    ),
    (
      v_empresa_id,
      'Analia Ferreira',
      '0984213202',
      NULL,
      'analia ferreira'
    ),
    (
      v_empresa_id,
      'Analia Figueredo',
      '0981815039',
      NULL,
      'analia figueredo'
    ),
    (
      v_empresa_id,
      'Analia Galeano',
      '0992851076',
      NULL,
      'analia galeano'
    ),
    (
      v_empresa_id,
      'Analia Gomez',
      '0986236371',
      NULL,
      'analia gomez'
    ),
    (
      v_empresa_id,
      'Analia Lopez',
      '0985998742',
      NULL,
      'analia lopez'
    ),
    (
      v_empresa_id,
      'Analia Ojeda',
      '0971404826',
      NULL,
      'analia ojeda'
    ),
    (
      v_empresa_id,
      'Analia Ojeda Vazquez',
      '0971404826',
      NULL,
      'analia ojeda vazquez'
    ),
    (
      v_empresa_id,
      'Analia Portillo',
      '0981389670',
      NULL,
      'analia portillo'
    ),
    (
      v_empresa_id,
      'Analia Ramos',
      '0971207997',
      NULL,
      'analia ramos'
    ),
    (
      v_empresa_id,
      'Analia Riveros',
      '0982639191',
      NULL,
      'analia riveros'
    ),
    (
      v_empresa_id,
      'Analia Rojas',
      '0983999069',
      '1 selo (3)',
      'analia rojas'
    ),
    (
      v_empresa_id,
      'Analia Sanabria',
      '0981735450',
      NULL,
      'analia sanabria'
    ),
    (
      v_empresa_id,
      'Analia Spina',
      '0985948948',
      NULL,
      'analia spina'
    ),
    (
      v_empresa_id,
      'Analia Valdez',
      '0991534884',
      NULL,
      'analia valdez'
    ),
    (
      v_empresa_id,
      'Analia Vissani',
      '0994316966',
      '1 selo (1)',
      'analia vissani'
    ),
    (
      v_empresa_id,
      'Analis Borja',
      '0994478519',
      NULL,
      'analis borja'
    ),
    (
      v_empresa_id,
      'Analiz Acosta',
      '0981197802',
      NULL,
      'analiz acosta'
    ),
    (
      v_empresa_id,
      'Analiz Montania',
      '0981518341',
      NULL,
      'analiz montania'
    ),
    (
      v_empresa_id,
      'Anara Caceres',
      '0986118412',
      NULL,
      'anara caceres'
    ),
    (
      v_empresa_id,
      'Anastasia Menezes',
      '0992854500',
      NULL,
      'anastasia menezes'
    ),
    (
      v_empresa_id,
      'Anayeli Insfran',
      '0971964309',
      NULL,
      'anayeli insfran'
    ),
    (
      v_empresa_id,
      'Andra Abila',
      '0986415546',
      NULL,
      'andra abila'
    ),
    (
      v_empresa_id,
      'Andre',
      NULL,
      NULL,
      'andre'
    ),
    (
      v_empresa_id,
      'Andre Abdo',
      '0972171741',
      NULL,
      'andre abdo'
    ),
    (
      v_empresa_id,
      'andrea',
      '0992249130',
      NULL,
      'andrea'
    ),
    (
      v_empresa_id,
      'Andrea Aguilera',
      '0981408505',
      '10mil',
      'andrea aguilera'
    ),
    (
      v_empresa_id,
      'Andrea Albarenga',
      '0984279463',
      NULL,
      'andrea albarenga'
    ),
    (
      v_empresa_id,
      'Andrea Alberdi',
      '0994522787',
      '10mil',
      'andrea alberdi'
    ),
    (
      v_empresa_id,
      'Andrea Alcaraz',
      '0984416700',
      NULL,
      'andrea alcaraz'
    ),
    (
      v_empresa_id,
      'Andrea Alfonso',
      '0994399444',
      NULL,
      'andrea alfonso'
    ),
    (
      v_empresa_id,
      'Andrea Almada',
      '0981151593',
      NULL,
      'andrea almada'
    ),
    (
      v_empresa_id,
      'Andrea Alonso',
      '0986514231',
      '10MIL',
      'andrea alonso'
    ),
    (
      v_empresa_id,
      'Andrea Alviso',
      '0992249130',
      NULL,
      'andrea alviso'
    ),
    (
      v_empresa_id,
      'Andrea Amarilla',
      '0986733105',
      '30MIL',
      'andrea amarilla'
    ),
    (
      v_empresa_id,
      'Andrea Araujo',
      '0982883472',
      '10MIL',
      'andrea araujo'
    ),
    (
      v_empresa_id,
      'Andrea Baez',
      '0992812787',
      NULL,
      'andrea baez'
    ),
    (
      v_empresa_id,
      'Andrea Benitez',
      '0976595567',
      NULL,
      'andrea benitez'
    ),
    (
      v_empresa_id,
      'Andrea Berdon',
      '0982939404',
      NULL,
      'andrea berdon'
    ),
    (
      v_empresa_id,
      'Andrea Bobadilla',
      '0972203724',
      NULL,
      'andrea bobadilla'
    ),
    (
      v_empresa_id,
      'Andrea Brizuela',
      '0982376894',
      NULL,
      'andrea brizuela'
    ),
    (
      v_empresa_id,
      'Andrea Caballero',
      '0994349126',
      '10mil',
      'andrea caballero'
    ),
    (
      v_empresa_id,
      'Andrea Cabrera',
      '0991379262',
      NULL,
      'andrea cabrera'
    ),
    (
      v_empresa_id,
      'Andrea Caceres',
      '0981538980',
      NULL,
      'andrea caceres'
    ),
    (
      v_empresa_id,
      'Andrea Cano',
      '0981466467',
      NULL,
      'andrea cano'
    ),
    (
      v_empresa_id,
      'Andrea Chavez',
      '0971633092',
      NULL,
      'andrea chavez'
    ),
    (
      v_empresa_id,
      'Andrea Davalos',
      '0991929243',
      '10mil',
      'andrea davalos'
    ),
    (
      v_empresa_id,
      'Andrea Delgadillo',
      '0984609383',
      NULL,
      'andrea delgadillo'
    ),
    (
      v_empresa_id,
      'Andrea Diaz',
      '0983661847',
      '30mil',
      'andrea diaz'
    ),
    (
      v_empresa_id,
      'Andrea Dominguez',
      '0984135087',
      NULL,
      'andrea dominguez'
    ),
    (
      v_empresa_id,
      'Andrea Drake',
      '0981505930',
      NULL,
      'andrea drake'
    ),
    (
      v_empresa_id,
      'Andrea Duarte',
      '0982132315',
      '20mil',
      'andrea duarte'
    ),
    (
      v_empresa_id,
      'Andrea Eliceche',
      '0972439680',
      NULL,
      'andrea eliceche'
    ),
    (
      v_empresa_id,
      'Andrea Figari',
      '0961819770',
      NULL,
      'andrea figari'
    ),
    (
      v_empresa_id,
      'Andrea Figueredo',
      '0981407448',
      NULL,
      'andrea figueredo'
    ),
    (
      v_empresa_id,
      'Andrea Franchi',
      '0981246061',
      NULL,
      'andrea franchi'
    ),
    (
      v_empresa_id,
      'Andrea Fretes',
      '0991300554',
      NULL,
      'andrea fretes'
    ),
    (
      v_empresa_id,
      'Andrea Galeano',
      '0985300145',
      NULL,
      'andrea galeano'
    ),
    (
      v_empresa_id,
      'Andrea Gamarra',
      '0982563998',
      '1 selo (1)',
      'andrea gamarra'
    ),
    (
      v_empresa_id,
      'Andrea Garay',
      '0985588189',
      NULL,
      'andrea garay'
    ),
    (
      v_empresa_id,
      'Andrea Gavilan',
      '0982123691',
      NULL,
      'andrea gavilan'
    ),
    (
      v_empresa_id,
      'Andrea Gimenez',
      '0961851745',
      NULL,
      'andrea gimenez'
    ),
    (
      v_empresa_id,
      'Andrea Godoy',
      '0991910200',
      NULL,
      'andrea godoy'
    ),
    (
      v_empresa_id,
      'Andrea Gonzalez',
      '0983383698',
      '10mil',
      'andrea gonzalez'
    ),
    (
      v_empresa_id,
      'Andrea Granado',
      '0991802578',
      NULL,
      'andrea granado'
    ),
    (
      v_empresa_id,
      'Andrea Guerrero',
      '0981824481',
      NULL,
      'andrea guerrero'
    ),
    (
      v_empresa_id,
      'Andrea Gutierres',
      '0981297827',
      NULL,
      'andrea gutierres'
    ),
    (
      v_empresa_id,
      'Andrea Gutierrez',
      '0981297827',
      NULL,
      'andrea gutierrez'
    ),
    (
      v_empresa_id,
      'Andrea Holsbach',
      '0981920924',
      NULL,
      'andrea holsbach'
    ),
    (
      v_empresa_id,
      'Andrea Jara',
      '0984883072',
      '10MIL',
      'andrea jara'
    ),
    (
      v_empresa_id,
      'Andrea Ledesma',
      '0971268844',
      '10mil',
      'andrea ledesma'
    ),
    (
      v_empresa_id,
      'Andrea Lopez',
      '0971696606',
      NULL,
      'andrea lopez'
    ),
    (
      v_empresa_id,
      'Andrea Lugo',
      '0985720822',
      NULL,
      'andrea lugo'
    ),
    (
      v_empresa_id,
      'Andrea Manzur',
      '0994884670',
      NULL,
      'andrea manzur'
    ),
    (
      v_empresa_id,
      'Andrea Martinez',
      '0981167197',
      NULL,
      'andrea martinez'
    ),
    (
      v_empresa_id,
      'Andrea Medina',
      '0992442080',
      NULL,
      'andrea medina'
    ),
    (
      v_empresa_id,
      'Andrea Mendez',
      '0982957741',
      '10MIL',
      'andrea mendez'
    ),
    (
      v_empresa_id,
      'Andrea Meza',
      '0981251085',
      NULL,
      'andrea meza'
    ),
    (
      v_empresa_id,
      'Andrea Molinas',
      '0981385666',
      NULL,
      'andrea molinas'
    ),
    (
      v_empresa_id,
      'Andrea Morales',
      '0992806078',
      NULL,
      'andrea morales'
    ),
    (
      v_empresa_id,
      'Andrea Mu;os',
      '0986283823',
      NULL,
      'andrea mu;os'
    ),
    (
      v_empresa_id,
      'Andrea Nunes',
      '0981119436',
      NULL,
      'andrea nunes'
    ),
    (
      v_empresa_id,
      'Andrea Nunez',
      '0981490716',
      NULL,
      'andrea nunez'
    ),
    (
      v_empresa_id,
      'Andrea Peres',
      '0972707590',
      NULL,
      'andrea peres'
    ),
    (
      v_empresa_id,
      'Andrea Portillo',
      '0984992083',
      NULL,
      'andrea portillo'
    ),
    (
      v_empresa_id,
      'Andrea Quevedo',
      '0972195455',
      '1 selo (1)',
      'andrea quevedo'
    ),
    (
      v_empresa_id,
      'Andrea Riveros',
      '0994146919',
      '1 selo (2)',
      'andrea riveros'
    ),
    (
      v_empresa_id,
      'Andrea Rodriguez',
      '0975434322',
      NULL,
      'andrea rodriguez'
    ),
    (
      v_empresa_id,
      'Andrea Roiss',
      '0992327384',
      NULL,
      'andrea roiss'
    ),
    (
      v_empresa_id,
      'Andrea Rojas',
      '0991440330',
      NULL,
      'andrea rojas'
    ),
    (
      v_empresa_id,
      'Andrea Rolon',
      '0975191379',
      '20mil',
      'andrea rolon'
    ),
    (
      v_empresa_id,
      'Andrea Ruiz Diaz',
      '0981244728',
      NULL,
      'andrea ruiz diaz'
    ),
    (
      v_empresa_id,
      'Andrea Samaniego',
      '0972216906',
      '20MIL',
      'andrea samaniego'
    ),
    (
      v_empresa_id,
      'Andrea Santa Cruz',
      '0994209361',
      NULL,
      'andrea santa cruz'
    ),
    (
      v_empresa_id,
      'Andrea Segovia',
      '0981651115',
      NULL,
      'andrea segovia'
    ),
    (
      v_empresa_id,
      'Andrea Seraffini',
      '0981831046',
      NULL,
      'andrea seraffini'
    ),
    (
      v_empresa_id,
      'Andrea Soler',
      NULL,
      NULL,
      'andrea soler'
    ),
    (
      v_empresa_id,
      'Andrea Sosa',
      '0974244000',
      NULL,
      'andrea sosa'
    ),
    (
      v_empresa_id,
      'Andrea Torales',
      '0972567122',
      NULL,
      'andrea torales'
    ),
    (
      v_empresa_id,
      'Andrea Udagawa',
      '0984430044',
      NULL,
      'andrea udagawa'
    ),
    (
      v_empresa_id,
      'Andrea Velazquez',
      '0982525824',
      '10mil',
      'andrea velazquez'
    ),
    (
      v_empresa_id,
      'Andrea Vera',
      '0972292892',
      NULL,
      'andrea vera'
    ),
    (
      v_empresa_id,
      'Andrea Villamallor',
      '0994340219',
      NULL,
      'andrea villamallor'
    ),
    (
      v_empresa_id,
      'Andrea Villamayor',
      '0994340219',
      '10mil',
      'andrea villamayor'
    ),
    (
      v_empresa_id,
      'Andres Alvarez',
      '0981083170',
      NULL,
      'andres alvarez'
    ),
    (
      v_empresa_id,
      'Andres Dominguez',
      '0985848004',
      NULL,
      'andres dominguez'
    ),
    (
      v_empresa_id,
      'Andres Felipe',
      '0981495870',
      NULL,
      'andres felipe'
    ),
    (
      v_empresa_id,
      'Andres Lopez',
      '0973214107',
      NULL,
      'andres lopez'
    ),
    (
      v_empresa_id,
      'Andres Ostertag',
      '0974613355',
      NULL,
      'andres ostertag'
    ),
    (
      v_empresa_id,
      'Andres Romero',
      '0984514884',
      NULL,
      'andres romero'
    ),
    (
      v_empresa_id,
      'Andres Vergara',
      '0972492824',
      NULL,
      'andres vergara'
    ),
    (
      v_empresa_id,
      'Andresa Esquivel',
      '0994136601',
      NULL,
      'andresa esquivel'
    ),
    (
      v_empresa_id,
      'Andy Esquivel',
      '0994136601',
      NULL,
      'andy esquivel'
    ),
    (
      v_empresa_id,
      'Andy Jara',
      '0984883072',
      NULL,
      'andy jara'
    ),
    (
      v_empresa_id,
      'Angel Maldonado',
      '0991343465',
      NULL,
      'angel maldonado'
    ),
    (
      v_empresa_id,
      'Angel Nu;ez',
      '0982314693',
      NULL,
      'angel nu;ez'
    ),
    (
      v_empresa_id,
      'Angel Paez',
      '0985718558',
      NULL,
      'angel paez'
    ),
    (
      v_empresa_id,
      'Angel Riquelme',
      '0986606624',
      NULL,
      'angel riquelme'
    ),
    (
      v_empresa_id,
      'Angela Ayala',
      '0972595632',
      NULL,
      'angela ayala'
    ),
    (
      v_empresa_id,
      'Angela Gonzalez',
      '0976409894',
      NULL,
      'angela gonzalez'
    ),
    (
      v_empresa_id,
      'Angela Lugo',
      '0986434971',
      NULL,
      'angela lugo'
    ),
    (
      v_empresa_id,
      'Angela Olmedo',
      '0991765733',
      NULL,
      'angela olmedo'
    ),
    (
      v_empresa_id,
      'Angela Riquelme',
      '0981750040',
      NULL,
      'angela riquelme'
    ),
    (
      v_empresa_id,
      'Angela Soto',
      '0981461772',
      NULL,
      'angela soto'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 2: filas 501..1000
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Angeles Barreto',
      '0981966050',
      '10mil',
      'angeles barreto'
    ),
    (
      v_empresa_id,
      'Angeles Espinola',
      '0991876520',
      NULL,
      'angeles espinola'
    ),
    (
      v_empresa_id,
      'Angeles Ferreira',
      '0986809852',
      NULL,
      'angeles ferreira'
    ),
    (
      v_empresa_id,
      'Angeles Valdez',
      '0984622300',
      NULL,
      'angeles valdez'
    ),
    (
      v_empresa_id,
      'Angeles Viera',
      '0981412847',
      NULL,
      'angeles viera'
    ),
    (
      v_empresa_id,
      'Angeles Villasanti',
      '0986411410',
      NULL,
      'angeles villasanti'
    ),
    (
      v_empresa_id,
      'Angelica Bernal',
      '0986144678',
      NULL,
      'angelica bernal'
    ),
    (
      v_empresa_id,
      'Angelica Cabrera',
      '0982641530',
      NULL,
      'angelica cabrera'
    ),
    (
      v_empresa_id,
      'Angelica Cegelnicki',
      '0992534438',
      NULL,
      'angelica cegelnicki'
    ),
    (
      v_empresa_id,
      'Angelica Duarte',
      '0976527166',
      '1 selo (1)',
      'angelica duarte'
    ),
    (
      v_empresa_id,
      'Angelica Florentin',
      '0981833391',
      NULL,
      'angelica florentin'
    ),
    (
      v_empresa_id,
      'Angelica Garcete',
      '0986844606',
      NULL,
      'angelica garcete'
    ),
    (
      v_empresa_id,
      'Angelica Gonzalez',
      '0981823791',
      NULL,
      'angelica gonzalez'
    ),
    (
      v_empresa_id,
      'Angelica Pando',
      '0984872208',
      NULL,
      'angelica pando'
    ),
    (
      v_empresa_id,
      'Angelica Ramirez',
      '0982169112',
      NULL,
      'angelica ramirez'
    ),
    (
      v_empresa_id,
      'Angelica Rivero',
      NULL,
      NULL,
      'angelica rivero'
    ),
    (
      v_empresa_id,
      'Angelica Sosa',
      '0984480786',
      '30mil',
      'angelica sosa'
    ),
    (
      v_empresa_id,
      'Angelica Torres',
      '0985701341',
      NULL,
      'angelica torres'
    ),
    (
      v_empresa_id,
      'Angie Alvarez',
      '0982939213',
      NULL,
      'angie alvarez'
    ),
    (
      v_empresa_id,
      'Angy Alvarez',
      '0982939213',
      NULL,
      'angy alvarez'
    ),
    (
      v_empresa_id,
      'Angy Mendez',
      '0982477942',
      '60MIL',
      'angy mendez'
    ),
    (
      v_empresa_id,
      'Ania Britos',
      '0994929732',
      NULL,
      'ania britos'
    ),
    (
      v_empresa_id,
      'Anicia Cuevas',
      '0983428383',
      NULL,
      'anicia cuevas'
    ),
    (
      v_empresa_id,
      'Aninka Ferreira',
      '0972180665',
      '10mil',
      'aninka ferreira'
    ),
    (
      v_empresa_id,
      'Anita Fernandez',
      '0982978022',
      NULL,
      'anita fernandez'
    ),
    (
      v_empresa_id,
      'Anthony Ontario',
      '0972032568',
      NULL,
      'anthony ontario'
    ),
    (
      v_empresa_id,
      'Antonela Bareiro',
      '0981333274',
      NULL,
      'antonela bareiro'
    ),
    (
      v_empresa_id,
      'Antonela Diaz',
      '0992886255',
      NULL,
      'antonela diaz'
    ),
    (
      v_empresa_id,
      'Antonela Jara',
      '37924629994',
      NULL,
      'antonela jara'
    ),
    (
      v_empresa_id,
      'Antonela Villasanti',
      '0984660153',
      NULL,
      'antonela villasanti'
    ),
    (
      v_empresa_id,
      'Antonella Boselli',
      '0981880731',
      '10MIL',
      'antonella boselli'
    ),
    (
      v_empresa_id,
      'Antonella Cabral',
      '0985530315',
      NULL,
      'antonella cabral'
    ),
    (
      v_empresa_id,
      'Antonella Cattoni',
      '0985337794',
      '10mil',
      'antonella cattoni'
    ),
    (
      v_empresa_id,
      'Antonella Cuenca',
      '0972844809',
      NULL,
      'antonella cuenca'
    ),
    (
      v_empresa_id,
      'Antonella Diaz',
      '0992886255',
      NULL,
      'antonella diaz'
    ),
    (
      v_empresa_id,
      'Antonella Dinatalle',
      '0992310116',
      NULL,
      'antonella dinatalle'
    ),
    (
      v_empresa_id,
      'Antonella Ducrot',
      '0991249293',
      '10mil',
      'antonella ducrot'
    ),
    (
      v_empresa_id,
      'Antonella Espinola',
      '0981674891',
      '20mil',
      'antonella espinola'
    ),
    (
      v_empresa_id,
      'Antonella Felippo',
      '0981440416',
      NULL,
      'antonella felippo'
    ),
    (
      v_empresa_id,
      'Antonella Gomez',
      '0994399912',
      NULL,
      'antonella gomez'
    ),
    (
      v_empresa_id,
      'Antonella Guitiierrez',
      '0983419728',
      NULL,
      'antonella guitiierrez'
    ),
    (
      v_empresa_id,
      'Antonella Hermosa',
      '0981242301',
      NULL,
      'antonella hermosa'
    ),
    (
      v_empresa_id,
      'Antonella Lastina',
      '0985863503',
      NULL,
      'antonella lastina'
    ),
    (
      v_empresa_id,
      'Antonella Melgarejo',
      '0986684715',
      '10mil',
      'antonella melgarejo'
    ),
    (
      v_empresa_id,
      'Antonella Mojoli',
      '0986109811',
      NULL,
      'antonella mojoli'
    ),
    (
      v_empresa_id,
      'Antonella Pacielo',
      '0981721991',
      NULL,
      'antonella pacielo'
    ),
    (
      v_empresa_id,
      'Antonella Rocicielo',
      '0981721991',
      NULL,
      'antonella rocicielo'
    ),
    (
      v_empresa_id,
      'Antonella Sanchez',
      '0994274949',
      NULL,
      'antonella sanchez'
    ),
    (
      v_empresa_id,
      'Antonella Velazquez',
      '0985564996',
      NULL,
      'antonella velazquez'
    ),
    (
      v_empresa_id,
      'Antonella Vera',
      '0981334513',
      NULL,
      'antonella vera'
    ),
    (
      v_empresa_id,
      'Antonella Yubero',
      '0981743440',
      NULL,
      'antonella yubero'
    ),
    (
      v_empresa_id,
      'Antonia Argana',
      '0961884002',
      NULL,
      'antonia argana'
    ),
    (
      v_empresa_id,
      'Antonia Arganha',
      '0961884002',
      NULL,
      'antonia arganha'
    ),
    (
      v_empresa_id,
      'Antonia Baez',
      '0985948741',
      NULL,
      'antonia baez'
    ),
    (
      v_empresa_id,
      'Antonia Borja',
      '0994354233',
      NULL,
      'antonia borja'
    ),
    (
      v_empresa_id,
      'Antonia Dominguez',
      '0983694609',
      NULL,
      'antonia dominguez'
    ),
    (
      v_empresa_id,
      'Antonia Gonzalez',
      '0982595723',
      NULL,
      'antonia gonzalez'
    ),
    (
      v_empresa_id,
      'Antonia Massare',
      '0994884870',
      NULL,
      'antonia massare'
    ),
    (
      v_empresa_id,
      'Antonia Zotelo',
      '0994680059',
      NULL,
      'antonia zotelo'
    ),
    (
      v_empresa_id,
      'Antonio Larroza',
      '0975240768',
      NULL,
      'antonio larroza'
    ),
    (
      v_empresa_id,
      'Antonio Lopez Rivas',
      '0981255323',
      NULL,
      'antonio lopez rivas'
    ),
    (
      v_empresa_id,
      'Ara Catanas',
      '0982247944',
      NULL,
      'ara catanas'
    ),
    (
      v_empresa_id,
      'Ara Dunjo',
      '0987130376',
      NULL,
      'ara dunjo'
    ),
    (
      v_empresa_id,
      'Ara Garcete',
      '0984718015',
      '10mil',
      'ara garcete'
    ),
    (
      v_empresa_id,
      'Ara Jaime',
      '0986721998',
      '10mil',
      'ara jaime'
    ),
    (
      v_empresa_id,
      'Araceli',
      '0992291277',
      '20 mil',
      'araceli'
    ),
    (
      v_empresa_id,
      'Araceli Acosta',
      '0992291277',
      NULL,
      'araceli acosta'
    ),
    (
      v_empresa_id,
      'Araceli Aguilera',
      '0986164566',
      NULL,
      'araceli aguilera'
    ),
    (
      v_empresa_id,
      'Araceli Alvarez',
      '0994531515',
      '10mil',
      'araceli alvarez'
    ),
    (
      v_empresa_id,
      'Araceli Aranda',
      '0986666218',
      NULL,
      'araceli aranda'
    ),
    (
      v_empresa_id,
      'Araceli Arando',
      '0986666218',
      NULL,
      'araceli arando'
    ),
    (
      v_empresa_id,
      'Araceli Arrua',
      '0993353949',
      NULL,
      'araceli arrua'
    ),
    (
      v_empresa_id,
      'Araceli Ayala',
      '0983857467',
      '10mil',
      'araceli ayala'
    ),
    (
      v_empresa_id,
      'Araceli Barreto',
      '0982906499',
      '30mil',
      'araceli barreto'
    ),
    (
      v_empresa_id,
      'Araceli Benitez',
      '0981198234',
      NULL,
      'araceli benitez'
    ),
    (
      v_empresa_id,
      'Araceli Bineitez',
      '0994330333',
      NULL,
      'araceli bineitez'
    ),
    (
      v_empresa_id,
      'Araceli Colman',
      '0982807763',
      NULL,
      'araceli colman'
    ),
    (
      v_empresa_id,
      'Araceli Duarte',
      '0991228685',
      '10MIL',
      'araceli duarte'
    ),
    (
      v_empresa_id,
      'Araceli Dure',
      '0994659544',
      NULL,
      'araceli dure'
    ),
    (
      v_empresa_id,
      'Araceli Galeano',
      '0984112043',
      NULL,
      'araceli galeano'
    ),
    (
      v_empresa_id,
      'Araceli Garay',
      '9712689097',
      NULL,
      'araceli garay'
    ),
    (
      v_empresa_id,
      'Araceli Garcia',
      '0971633050',
      NULL,
      'araceli garcia'
    ),
    (
      v_empresa_id,
      'Araceli Gonzalez',
      '0972108320',
      NULL,
      'araceli gonzalez'
    ),
    (
      v_empresa_id,
      'Araceli Lopez',
      '0992623947',
      NULL,
      'araceli lopez'
    ),
    (
      v_empresa_id,
      'Araceli Martinez',
      '0994845056',
      '1 selo (4)',
      'araceli martinez'
    ),
    (
      v_empresa_id,
      'Araceli Meza',
      '0983801233',
      NULL,
      'araceli meza'
    ),
    (
      v_empresa_id,
      'Araceli Mnosalva',
      '0994728839',
      NULL,
      'araceli mnosalva'
    ),
    (
      v_empresa_id,
      'Araceli Molinari',
      '0972418972',
      NULL,
      'araceli molinari'
    ),
    (
      v_empresa_id,
      'Araceli Olmedo',
      '0981831306',
      NULL,
      'araceli olmedo'
    ),
    (
      v_empresa_id,
      'Araceli Ortega',
      '0982328227',
      NULL,
      'araceli ortega'
    ),
    (
      v_empresa_id,
      'Araceli Paredes',
      '0984968442',
      NULL,
      'araceli paredes'
    ),
    (
      v_empresa_id,
      'Araceli Piris',
      '606',
      NULL,
      'araceli piris'
    ),
    (
      v_empresa_id,
      'Araceli Quintana',
      '0985945519',
      '10MIL',
      'araceli quintana'
    ),
    (
      v_empresa_id,
      'Araceli Sanchez',
      '0986839900',
      NULL,
      'araceli sanchez'
    ),
    (
      v_empresa_id,
      'Araceli Sosa',
      '0972720994',
      '1 selo (1)',
      'araceli sosa'
    ),
    (
      v_empresa_id,
      'Araceli Suarez',
      '0991807448',
      NULL,
      'araceli suarez'
    ),
    (
      v_empresa_id,
      'Araceli Villalba',
      '0991313906',
      NULL,
      'araceli villalba'
    ),
    (
      v_empresa_id,
      'Aracelli Acosta',
      '0981046114',
      '10mil',
      'aracelli acosta'
    ),
    (
      v_empresa_id,
      'Aracely Amarilla',
      '0986785280',
      '20mil',
      'aracely amarilla'
    ),
    (
      v_empresa_id,
      'Aracely Araujo',
      '0973696049',
      '30MIL',
      'aracely araujo'
    ),
    (
      v_empresa_id,
      'Aracely Arguello',
      '0983820555',
      NULL,
      'aracely arguello'
    ),
    (
      v_empresa_id,
      'Aracely Ayala',
      '0995375813',
      '10MIL',
      'aracely ayala'
    ),
    (
      v_empresa_id,
      'Aracely Casares',
      '0991683748',
      NULL,
      'aracely casares'
    ),
    (
      v_empresa_id,
      'Aracely Chavez',
      '0972233261',
      NULL,
      'aracely chavez'
    ),
    (
      v_empresa_id,
      'Aracely Fernandez',
      '0992264247',
      '30MIL',
      'aracely fernandez'
    ),
    (
      v_empresa_id,
      'Aracely Gonzalez',
      '0992910064',
      NULL,
      'aracely gonzalez'
    ),
    (
      v_empresa_id,
      'Aracely Manosalva',
      '0994728839',
      '30mil',
      'aracely manosalva'
    ),
    (
      v_empresa_id,
      'Aracely Olmedo',
      '0981842290',
      NULL,
      'aracely olmedo'
    ),
    (
      v_empresa_id,
      'Aracely Oviedo',
      '0976976517',
      '10mil',
      'aracely oviedo'
    ),
    (
      v_empresa_id,
      'Aracely Paciego',
      '0994488213',
      NULL,
      'aracely paciego'
    ),
    (
      v_empresa_id,
      'Aracely Suarez',
      '0991807448',
      NULL,
      'aracely suarez'
    ),
    (
      v_empresa_id,
      'Aracely Tong',
      '0976939458',
      NULL,
      'aracely tong'
    ),
    (
      v_empresa_id,
      'Aracely Zoilan',
      '0994473402',
      NULL,
      'aracely zoilan'
    ),
    (
      v_empresa_id,
      'Arami Arrua',
      '0982867608',
      NULL,
      'arami arrua'
    ),
    (
      v_empresa_id,
      'Arami Benitez',
      '0981711855',
      NULL,
      'arami benitez'
    ),
    (
      v_empresa_id,
      'Arami Bordon',
      '98323341',
      NULL,
      'arami bordon'
    ),
    (
      v_empresa_id,
      'Arami Dominguez',
      '0984350283',
      NULL,
      'arami dominguez'
    ),
    (
      v_empresa_id,
      'Arami Ferreira',
      '0986427205',
      NULL,
      'arami ferreira'
    ),
    (
      v_empresa_id,
      'Arami Godoy',
      '0985771183',
      NULL,
      'arami godoy'
    ),
    (
      v_empresa_id,
      'Arami Gomez',
      '0984613208',
      NULL,
      'arami gomez'
    ),
    (
      v_empresa_id,
      'Arami Mendez',
      '0983726547',
      NULL,
      'arami mendez'
    ),
    (
      v_empresa_id,
      'Arami Noguera',
      '0972224492',
      NULL,
      'arami noguera'
    ),
    (
      v_empresa_id,
      'Arami Pereira',
      '0992976401',
      NULL,
      'arami pereira'
    ),
    (
      v_empresa_id,
      'Arami Suss',
      '94251756',
      NULL,
      'arami suss'
    ),
    (
      v_empresa_id,
      'Arami Torres',
      '0976102885',
      NULL,
      'arami torres'
    ),
    (
      v_empresa_id,
      'Arami Vera',
      '0985565505',
      '20mil',
      'arami vera'
    ),
    (
      v_empresa_id,
      'Areli Vegas',
      '0982909444',
      NULL,
      'areli vegas'
    ),
    (
      v_empresa_id,
      'Arete',
      NULL,
      NULL,
      'arete'
    ),
    (
      v_empresa_id,
      'Arete Monitos',
      NULL,
      NULL,
      'arete monitos'
    ),
    (
      v_empresa_id,
      'Ariadna Cabrera',
      '0994884506',
      '20mil',
      'ariadna cabrera'
    ),
    (
      v_empresa_id,
      'Ariana Lugo',
      '0981648153',
      NULL,
      'ariana lugo'
    ),
    (
      v_empresa_id,
      'Ariel Mendieta',
      '0981150371',
      '10MIL',
      'ariel mendieta'
    ),
    (
      v_empresa_id,
      'Ariel Venialbo',
      '0981900692',
      NULL,
      'ariel venialbo'
    ),
    (
      v_empresa_id,
      'Arienne Barrientos',
      '0985176785',
      NULL,
      'arienne barrientos'
    ),
    (
      v_empresa_id,
      'Aritos',
      NULL,
      NULL,
      'aritos'
    ),
    (
      v_empresa_id,
      'Aritos bebe',
      NULL,
      NULL,
      'aritos bebe'
    ),
    (
      v_empresa_id,
      'Aritos plata',
      NULL,
      NULL,
      'aritos plata'
    ),
    (
      v_empresa_id,
      'Aritos tassi y pulseras',
      NULL,
      NULL,
      'aritos tassi y pulseras'
    ),
    (
      v_empresa_id,
      'Arnaldo Acosta',
      '0983327631',
      NULL,
      'arnaldo acosta'
    ),
    (
      v_empresa_id,
      'Arnaldo Alvarez',
      '0972681621',
      NULL,
      'arnaldo alvarez'
    ),
    (
      v_empresa_id,
      'Arturo Cabral',
      '0972666598',
      NULL,
      'arturo cabral'
    ),
    (
      v_empresa_id,
      'Arturo Weiler',
      '0981258865',
      NULL,
      'arturo weiler'
    ),
    (
      v_empresa_id,
      'Asnfelic Sanchez',
      '0991473650',
      '70MIL',
      'asnfelic sanchez'
    ),
    (
      v_empresa_id,
      'Astrid Sanz',
      '0991746403',
      '10mil',
      'astrid sanz'
    ),
    (
      v_empresa_id,
      'Asucena Garcete',
      '0986222240',
      NULL,
      'asucena garcete'
    ),
    (
      v_empresa_id,
      'Asucena Martinez',
      '0972707719',
      NULL,
      'asucena martinez'
    ),
    (
      v_empresa_id,
      'Asuncion Montania',
      '0971162181',
      NULL,
      'asuncion montania'
    ),
    (
      v_empresa_id,
      'Auda Riveros',
      '0983701700',
      NULL,
      'auda riveros'
    ),
    (
      v_empresa_id,
      'Auine De Cazal',
      NULL,
      NULL,
      'auine de cazal'
    ),
    (
      v_empresa_id,
      'Aura Ramoa',
      '0981563927',
      NULL,
      'aura ramoa'
    ),
    (
      v_empresa_id,
      'Aurelia Mesa',
      NULL,
      NULL,
      'aurelia mesa'
    ),
    (
      v_empresa_id,
      'Aurora',
      NULL,
      NULL,
      'aurora'
    ),
    (
      v_empresa_id,
      'Aurora Velazquez',
      '0986537900',
      NULL,
      'aurora velazquez'
    ),
    (
      v_empresa_id,
      'Auroris',
      NULL,
      NULL,
      'auroris'
    ),
    (
      v_empresa_id,
      'Auxiliadora Sovala',
      '0971138364',
      NULL,
      'auxiliadora sovala'
    ),
    (
      v_empresa_id,
      'Avril',
      '71506863',
      NULL,
      'avril'
    ),
    (
      v_empresa_id,
      'Avril Arzamendia',
      '0983385400',
      NULL,
      'avril arzamendia'
    ),
    (
      v_empresa_id,
      'Avril Mer',
      NULL,
      NULL,
      'avril mer'
    ),
    (
      v_empresa_id,
      'Avriu',
      NULL,
      NULL,
      'avriu'
    ),
    (
      v_empresa_id,
      'Axel Cortaza',
      '0982482985',
      NULL,
      'axel cortaza'
    ),
    (
      v_empresa_id,
      'Axel Villas boa',
      '0984121418',
      NULL,
      'axel villas boa'
    ),
    (
      v_empresa_id,
      'Ayelen Gimenez',
      '0983457007',
      '10mil',
      'ayelen gimenez'
    ),
    (
      v_empresa_id,
      'Ayelen Meneces',
      '0981535149',
      NULL,
      'ayelen meneces'
    ),
    (
      v_empresa_id,
      'Ayelen Roman',
      '0983490629',
      NULL,
      'ayelen roman'
    ),
    (
      v_empresa_id,
      'Ayelen Suarez',
      '0983011121',
      NULL,
      'ayelen suarez'
    ),
    (
      v_empresa_id,
      'Ayelen Villar',
      '0985238163',
      '1 selo (2)',
      'ayelen villar'
    ),
    (
      v_empresa_id,
      'Ayelen Zaracho',
      '0993435901',
      NULL,
      'ayelen zaracho'
    ),
    (
      v_empresa_id,
      'Ayesa Halley',
      '0981580090',
      NULL,
      'ayesa halley'
    ),
    (
      v_empresa_id,
      'Aylen Dure',
      '0971921781',
      NULL,
      'aylen dure'
    ),
    (
      v_empresa_id,
      'Aylen Gimenez',
      '0994532426',
      '20mil',
      'aylen gimenez'
    ),
    (
      v_empresa_id,
      'Ayleneen Sarubbi',
      '0972900041',
      NULL,
      'ayleneen sarubbi'
    ),
    (
      v_empresa_id,
      'Azaria Duarte',
      '0983378290',
      NULL,
      'azaria duarte'
    ),
    (
      v_empresa_id,
      'Azul Benitez',
      '0984761683',
      NULL,
      'azul benitez'
    ),
    (
      v_empresa_id,
      'Azul Cantero',
      '0992412171',
      NULL,
      'azul cantero'
    ),
    (
      v_empresa_id,
      'Azuzena Duarte',
      '0971255449',
      NULL,
      'azuzena duarte'
    ),
    (
      v_empresa_id,
      'baberos bandana lyf',
      NULL,
      NULL,
      'baberos bandana lyf'
    ),
    (
      v_empresa_id,
      'BABEROS LYF',
      NULL,
      NULL,
      'baberos lyf'
    ),
    (
      v_empresa_id,
      'baberos lyf bandana',
      NULL,
      NULL,
      'baberos lyf bandana'
    ),
    (
      v_empresa_id,
      'babuches',
      NULL,
      NULL,
      'babuches'
    ),
    (
      v_empresa_id,
      'Baldomera Sanchez',
      '0985777299',
      '30mil',
      'baldomera sanchez'
    ),
    (
      v_empresa_id,
      'Bania Alvarenga',
      '0985292394',
      NULL,
      'bania alvarenga'
    ),
    (
      v_empresa_id,
      'Barabara Gabagleio',
      '0986422267',
      NULL,
      'barabara gabagleio'
    ),
    (
      v_empresa_id,
      'Barbara Chamorro',
      '0972463948',
      NULL,
      'barbara chamorro'
    ),
    (
      v_empresa_id,
      'Barbara Jimenez',
      '0981428277',
      NULL,
      'barbara jimenez'
    ),
    (
      v_empresa_id,
      'Barbara Robledo',
      '0982176584',
      '10MIL',
      'barbara robledo'
    ),
    (
      v_empresa_id,
      'Barry Kehler',
      '0973510052',
      NULL,
      'barry kehler'
    ),
    (
      v_empresa_id,
      'Beatiz Benitez',
      '0994370334',
      NULL,
      'beatiz benitez'
    ),
    (
      v_empresa_id,
      'Beatriz Duarte',
      '0991541085',
      NULL,
      'beatriz duarte'
    ),
    (
      v_empresa_id,
      'Beatriz Escobar',
      '0985304646',
      '1 selo (2)',
      'beatriz escobar'
    ),
    (
      v_empresa_id,
      'Beatriz Garay',
      '0985846497',
      NULL,
      'beatriz garay'
    ),
    (
      v_empresa_id,
      'Beatriz Genes',
      '0985682521',
      NULL,
      'beatriz genes'
    ),
    (
      v_empresa_id,
      'Beatriz Gerbrand',
      '0985394893',
      NULL,
      'beatriz gerbrand'
    ),
    (
      v_empresa_id,
      'Beatriz Giagni',
      '0981137972',
      NULL,
      'beatriz giagni'
    ),
    (
      v_empresa_id,
      'Beatriz Gimenez',
      '0971258070',
      NULL,
      'beatriz gimenez'
    ),
    (
      v_empresa_id,
      'Beatruz Araujo',
      '0985549081',
      '30MIL',
      'beatruz araujo'
    ),
    (
      v_empresa_id,
      'Belen',
      NULL,
      NULL,
      'belen'
    ),
    (
      v_empresa_id,
      'Belen Acosta',
      '0981428495',
      '10mil',
      'belen acosta'
    ),
    (
      v_empresa_id,
      'Belen Almada',
      '0987209418',
      NULL,
      'belen almada'
    ),
    (
      v_empresa_id,
      'Belen Araujo',
      '0981811561',
      NULL,
      'belen araujo'
    ),
    (
      v_empresa_id,
      'Belen Argana',
      '0981151968',
      '1 selo (6)',
      'belen argana'
    ),
    (
      v_empresa_id,
      'Belen Avalos',
      '0983062238',
      '10mil',
      'belen avalos'
    ),
    (
      v_empresa_id,
      'Belen Baez',
      '0983444259',
      NULL,
      'belen baez'
    ),
    (
      v_empresa_id,
      'Belen Barrios',
      '0991694582',
      NULL,
      'belen barrios'
    ),
    (
      v_empresa_id,
      'Belen Benitez',
      '0982334695',
      NULL,
      'belen benitez'
    ),
    (
      v_empresa_id,
      'Belen Cabral',
      '0994387632',
      NULL,
      'belen cabral'
    ),
    (
      v_empresa_id,
      'Belen Cabrera',
      '0994270199',
      NULL,
      'belen cabrera'
    ),
    (
      v_empresa_id,
      'Belen Cardozo',
      '0983107710',
      NULL,
      'belen cardozo'
    ),
    (
      v_empresa_id,
      'Belen Chaparro',
      '0981910913',
      NULL,
      'belen chaparro'
    ),
    (
      v_empresa_id,
      'Belen Cristaldo',
      '0981292154',
      NULL,
      'belen cristaldo'
    ),
    (
      v_empresa_id,
      'Belen Cubilla',
      '0983111017',
      NULL,
      'belen cubilla'
    ),
    (
      v_empresa_id,
      'Belen de los Rios',
      '0981205731',
      '20mil',
      'belen de los rios'
    ),
    (
      v_empresa_id,
      'Belen Domanicczky',
      '0992308826',
      NULL,
      'belen domanicczky'
    ),
    (
      v_empresa_id,
      'Belen Dominguez',
      '0971860278',
      '1 selo (1)',
      'belen dominguez'
    ),
    (
      v_empresa_id,
      'Belen Duarte',
      '0983876408',
      '10mil',
      'belen duarte'
    ),
    (
      v_empresa_id,
      'Belen Echague',
      '0992442207',
      NULL,
      'belen echague'
    ),
    (
      v_empresa_id,
      'Belen Ehcague',
      '0992442207',
      NULL,
      'belen ehcague'
    ),
    (
      v_empresa_id,
      'Belen Escobar',
      '0972293905',
      NULL,
      'belen escobar'
    ),
    (
      v_empresa_id,
      'Belen Espinola',
      '0982678641',
      NULL,
      'belen espinola'
    ),
    (
      v_empresa_id,
      'Belen Estigarribia',
      '0982727326',
      NULL,
      'belen estigarribia'
    ),
    (
      v_empresa_id,
      'Belen Ferreira',
      '0983632456',
      '1 selo (1)',
      'belen ferreira'
    ),
    (
      v_empresa_id,
      'Belen Flor',
      '0971929393',
      NULL,
      'belen flor'
    ),
    (
      v_empresa_id,
      'Belen Gaete',
      '0976145313',
      NULL,
      'belen gaete'
    ),
    (
      v_empresa_id,
      'Belen Gimenez',
      '0991946672',
      NULL,
      'belen gimenez'
    ),
    (
      v_empresa_id,
      'Belen Glitz',
      NULL,
      NULL,
      'belen glitz'
    ),
    (
      v_empresa_id,
      'Belen Gomez',
      '0985461986',
      '1 selo (2)',
      'belen gomez'
    ),
    (
      v_empresa_id,
      'Belen Gonzalez',
      '0982355003',
      NULL,
      'belen gonzalez'
    ),
    (
      v_empresa_id,
      'Belen Gonzalez Rios',
      '0976398849',
      NULL,
      'belen gonzalez rios'
    ),
    (
      v_empresa_id,
      'Belen Machado',
      '0983596006',
      NULL,
      'belen machado'
    ),
    (
      v_empresa_id,
      'Belen Martinez',
      '0981747101',
      NULL,
      'belen martinez'
    ),
    (
      v_empresa_id,
      'Belen Melgarejo',
      '0976374314',
      '1 selo (1)',
      'belen melgarejo'
    ),
    (
      v_empresa_id,
      'Belen Mendoza',
      '0991279629',
      NULL,
      'belen mendoza'
    ),
    (
      v_empresa_id,
      'Belen Miranda',
      '0981149288',
      '1 selo (5)',
      'belen miranda'
    ),
    (
      v_empresa_id,
      'Belen Monzon',
      '0981326170',
      NULL,
      'belen monzon'
    ),
    (
      v_empresa_id,
      'Belen Morinigo',
      '0983020029',
      NULL,
      'belen morinigo'
    ),
    (
      v_empresa_id,
      'Belen Munos',
      '0994111304',
      NULL,
      'belen munos'
    ),
    (
      v_empresa_id,
      'Belen Nacimiento',
      '0981180822',
      NULL,
      'belen nacimiento'
    ),
    (
      v_empresa_id,
      'Belen Navarro',
      '0994216927',
      NULL,
      'belen navarro'
    ),
    (
      v_empresa_id,
      'Belen Nunez',
      '0984014602',
      NULL,
      'belen nunez'
    ),
    (
      v_empresa_id,
      'Belen Orego',
      '0971136090',
      NULL,
      'belen orego'
    ),
    (
      v_empresa_id,
      'Belen Orrego',
      '0972259670',
      NULL,
      'belen orrego'
    ),
    (
      v_empresa_id,
      'Belen Oviedo',
      '0981363073',
      NULL,
      'belen oviedo'
    ),
    (
      v_empresa_id,
      'Belen Paez',
      '0991744301',
      NULL,
      'belen paez'
    ),
    (
      v_empresa_id,
      'Belen Palacios',
      '0982115345',
      '10MIL',
      'belen palacios'
    ),
    (
      v_empresa_id,
      'Belen Paredes',
      '0992674078',
      NULL,
      'belen paredes'
    ),
    (
      v_empresa_id,
      'Belen pedrozo',
      '0992391825',
      NULL,
      'belen pedrozo'
    ),
    (
      v_empresa_id,
      'Belen Peralta',
      '0984283847',
      NULL,
      'belen peralta'
    ),
    (
      v_empresa_id,
      'Belen Pereira',
      '0972956284',
      NULL,
      'belen pereira'
    ),
    (
      v_empresa_id,
      'Belen Pereria',
      '0994359133',
      NULL,
      'belen pereria'
    ),
    (
      v_empresa_id,
      'Belen Ramirez',
      '0981508009',
      NULL,
      'belen ramirez'
    ),
    (
      v_empresa_id,
      'Belen Riveros',
      '0991584939',
      NULL,
      'belen riveros'
    ),
    (
      v_empresa_id,
      'Belen Rolon',
      '0972441831',
      NULL,
      'belen rolon'
    ),
    (
      v_empresa_id,
      'Belen Saenge',
      '0991833268',
      NULL,
      'belen saenge'
    ),
    (
      v_empresa_id,
      'Belen Saldivar',
      '0986197452',
      '10mil',
      'belen saldivar'
    ),
    (
      v_empresa_id,
      'Belen Sanabria',
      '0971751555',
      NULL,
      'belen sanabria'
    ),
    (
      v_empresa_id,
      'Belen Silvero',
      '0984692590',
      NULL,
      'belen silvero'
    ),
    (
      v_empresa_id,
      'Belen Talvera',
      '0991975937',
      '30MIL',
      'belen talvera'
    ),
    (
      v_empresa_id,
      'Belen Torres',
      '0991675341',
      NULL,
      'belen torres'
    ),
    (
      v_empresa_id,
      'Belen Vaesken',
      '0981330630',
      NULL,
      'belen vaesken'
    ),
    (
      v_empresa_id,
      'Belen Vargas',
      '0985300291',
      NULL,
      'belen vargas'
    ),
    (
      v_empresa_id,
      'Belen Zarate',
      '0974335895',
      '30mil',
      'belen zarate'
    ),
    (
      v_empresa_id,
      'Belina Perez',
      '0975681568',
      NULL,
      'belina perez'
    ),
    (
      v_empresa_id,
      'Belinda Martinez',
      '9872847799',
      NULL,
      'belinda martinez'
    ),
    (
      v_empresa_id,
      'Benigna Sanchez',
      '0971924967',
      NULL,
      'benigna sanchez'
    ),
    (
      v_empresa_id,
      'Benita Lopez',
      '0982541472',
      NULL,
      'benita lopez'
    ),
    (
      v_empresa_id,
      'Bennie Gildebran',
      '0976387076',
      '10mil',
      'bennie gildebran'
    ),
    (
      v_empresa_id,
      'Berenice Vega',
      '0985516208',
      NULL,
      'berenice vega'
    ),
    (
      v_empresa_id,
      'Bernardita Arguello',
      '0972765545',
      NULL,
      'bernardita arguello'
    ),
    (
      v_empresa_id,
      'Bernardo Arrua',
      '0972186137',
      '10MIL',
      'bernardo arrua'
    ),
    (
      v_empresa_id,
      'Bernardo Vera',
      '0984962661',
      '30MIL',
      'bernardo vera'
    ),
    (
      v_empresa_id,
      'Berthold Barg',
      NULL,
      NULL,
      'berthold barg'
    ),
    (
      v_empresa_id,
      'Bertol Ortiz',
      '0981662457',
      NULL,
      'bertol ortiz'
    ),
    (
      v_empresa_id,
      'Betania Acosta',
      '0981239514',
      NULL,
      'betania acosta'
    ),
    (
      v_empresa_id,
      'Betania Mendes',
      '0981615104',
      '10MIL',
      'betania mendes'
    ),
    (
      v_empresa_id,
      'Betania Ramirez',
      '0972773344',
      NULL,
      'betania ramirez'
    ),
    (
      v_empresa_id,
      'Betania toledo',
      '0994343453',
      NULL,
      'betania toledo'
    ),
    (
      v_empresa_id,
      'Betania Villagra',
      '0986486927',
      NULL,
      'betania villagra'
    ),
    (
      v_empresa_id,
      'Bethania Alvarez',
      '0992207811',
      NULL,
      'bethania alvarez'
    ),
    (
      v_empresa_id,
      'Bethania Chavez',
      '0981187386',
      NULL,
      'bethania chavez'
    ),
    (
      v_empresa_id,
      'Bethania Escobeiro',
      '0981123337',
      NULL,
      'bethania escobeiro'
    ),
    (
      v_empresa_id,
      'Bethania Joaquinho',
      '0992299419',
      NULL,
      'bethania joaquinho'
    ),
    (
      v_empresa_id,
      'Bethania Miriniego',
      '9844763334',
      '30mil',
      'bethania miriniego'
    ),
    (
      v_empresa_id,
      'Bethania Paredes',
      '0972140526',
      NULL,
      'bethania paredes'
    ),
    (
      v_empresa_id,
      'Bethania Perez',
      '0974101433',
      NULL,
      'bethania perez'
    ),
    (
      v_empresa_id,
      'Bethania Prieto',
      '0981250188',
      NULL,
      'bethania prieto'
    ),
    (
      v_empresa_id,
      'Bety Aguero',
      '0985209514',
      NULL,
      'bety aguero'
    ),
    (
      v_empresa_id,
      'Bianca Asilvera',
      '0986105429',
      NULL,
      'bianca asilvera'
    ),
    (
      v_empresa_id,
      'Bianca Barrios',
      '0986195739',
      NULL,
      'bianca barrios'
    ),
    (
      v_empresa_id,
      'Bianca Caceres',
      '0992685690',
      NULL,
      'bianca caceres'
    ),
    (
      v_empresa_id,
      'Bianca Echeverria',
      '0984406006',
      '10mil',
      'bianca echeverria'
    ),
    (
      v_empresa_id,
      'Bianca Espinola',
      '0976327029',
      '10mil',
      'bianca espinola'
    ),
    (
      v_empresa_id,
      'Bianca Ibara',
      '0983365151',
      NULL,
      'bianca ibara'
    ),
    (
      v_empresa_id,
      'Bianca Jara',
      '0986825774',
      NULL,
      'bianca jara'
    ),
    (
      v_empresa_id,
      'Bianca Lowen',
      '0984475763',
      NULL,
      'bianca lowen'
    ),
    (
      v_empresa_id,
      'Bianca Martinez',
      '0984243525',
      '1 selO (3)',
      'bianca martinez'
    ),
    (
      v_empresa_id,
      'Bianca Ortega',
      '0991785949',
      NULL,
      'bianca ortega'
    ),
    (
      v_empresa_id,
      'Bianca Reinoso',
      '0992304337',
      NULL,
      'bianca reinoso'
    ),
    (
      v_empresa_id,
      'Bianca Samaniego',
      '0994315585',
      NULL,
      'bianca samaniego'
    ),
    (
      v_empresa_id,
      'Bianca Taboada',
      '0985641752',
      NULL,
      'bianca taboada'
    ),
    (
      v_empresa_id,
      'Bianca Vega',
      '0985352936',
      NULL,
      'bianca vega'
    ),
    (
      v_empresa_id,
      'Bianca Vera',
      '0986169732',
      '1 selo (2)',
      'bianca vera'
    ),
    (
      v_empresa_id,
      'Bibi Lando',
      '0982705555',
      NULL,
      'bibi lando'
    ),
    (
      v_empresa_id,
      'Biianca caceres',
      '0992686690',
      NULL,
      'biianca caceres'
    ),
    (
      v_empresa_id,
      'Billy Heinrichs',
      '0971224769',
      NULL,
      'billy heinrichs'
    ),
    (
      v_empresa_id,
      'Billy Hildebrand',
      '0971425012',
      NULL,
      'billy hildebrand'
    ),
    (
      v_empresa_id,
      'Blanca Acevedo',
      NULL,
      NULL,
      'blanca acevedo'
    ),
    (
      v_empresa_id,
      'Blanca Aquino',
      '0971714617',
      NULL,
      'blanca aquino'
    ),
    (
      v_empresa_id,
      'Blanca Benitez',
      '0986180008',
      NULL,
      'blanca benitez'
    ),
    (
      v_empresa_id,
      'Blanca Fuentes',
      '0981298747',
      NULL,
      'blanca fuentes'
    ),
    (
      v_empresa_id,
      'Blanca Garcete',
      '0971165077',
      NULL,
      'blanca garcete'
    ),
    (
      v_empresa_id,
      'Blanca Genez',
      '0972996959',
      NULL,
      'blanca genez'
    ),
    (
      v_empresa_id,
      'Blanca Gonzalez',
      '0981143954',
      '1 selo (2)',
      'blanca gonzalez'
    ),
    (
      v_empresa_id,
      'Blanca Ortega',
      '0976909310',
      '1 selo (1)',
      'blanca ortega'
    ),
    (
      v_empresa_id,
      'Blanca Paredes',
      '0994253889',
      NULL,
      'blanca paredes'
    ),
    (
      v_empresa_id,
      'Blanca Sanchez',
      NULL,
      NULL,
      'blanca sanchez'
    ),
    (
      v_empresa_id,
      'Blanca Sanguina',
      '0981849236',
      NULL,
      'blanca sanguina'
    ),
    (
      v_empresa_id,
      'Blanca Yorki',
      '0981619977',
      NULL,
      'blanca yorki'
    ),
    (
      v_empresa_id,
      'Blelen Flores',
      '0971929393',
      NULL,
      'blelen flores'
    ),
    (
      v_empresa_id,
      'bobojacos y pijamas',
      NULL,
      NULL,
      'bobojacos y pijamas'
    ),
    (
      v_empresa_id,
      'Boddys',
      NULL,
      NULL,
      'boddys'
    ),
    (
      v_empresa_id,
      'body casa monica',
      NULL,
      NULL,
      'body casa monica'
    ),
    (
      v_empresa_id,
      'bodys bonanza',
      NULL,
      NULL,
      'bodys bonanza'
    ),
    (
      v_empresa_id,
      'Bodys casa monica',
      NULL,
      NULL,
      'bodys casa monica'
    ),
    (
      v_empresa_id,
      'Bodys Monica',
      NULL,
      NULL,
      'bodys monica'
    ),
    (
      v_empresa_id,
      'Branda Florencial',
      '0992413103',
      NULL,
      'branda florencial'
    ),
    (
      v_empresa_id,
      'Bredi Barra',
      '0984674131',
      NULL,
      'bredi barra'
    ),
    (
      v_empresa_id,
      'Brenda Balbuena',
      '0986421919',
      NULL,
      'brenda balbuena'
    ),
    (
      v_empresa_id,
      'Brenda Bracho',
      '0982836865',
      NULL,
      'brenda bracho'
    ),
    (
      v_empresa_id,
      'Brenda Brocha',
      '0982836865',
      NULL,
      'brenda brocha'
    ),
    (
      v_empresa_id,
      'Brenda Godoy',
      '0983570563',
      NULL,
      'brenda godoy'
    ),
    (
      v_empresa_id,
      'Brenda Gomez',
      '0974969420',
      NULL,
      'brenda gomez'
    ),
    (
      v_empresa_id,
      'Brenda Gonzalez',
      '0971443430',
      NULL,
      'brenda gonzalez'
    ),
    (
      v_empresa_id,
      'Brenda Jara',
      '0981681082',
      NULL,
      'brenda jara'
    ),
    (
      v_empresa_id,
      'Brenda Lopez',
      '0992443487',
      NULL,
      'brenda lopez'
    ),
    (
      v_empresa_id,
      'Brenda Malvori',
      '0984645163',
      NULL,
      'brenda malvori'
    ),
    (
      v_empresa_id,
      'Brenda Morel',
      '0972285413',
      NULL,
      'brenda morel'
    ),
    (
      v_empresa_id,
      'Brenda Riquelme',
      '0984479584',
      NULL,
      'brenda riquelme'
    ),
    (
      v_empresa_id,
      'Brenda Rojas',
      '0982418897',
      NULL,
      'brenda rojas'
    ),
    (
      v_empresa_id,
      'Brian Fretes',
      '0986799658',
      NULL,
      'brian fretes'
    ),
    (
      v_empresa_id,
      'Brigida Torres',
      '0991614002',
      NULL,
      'brigida torres'
    ),
    (
      v_empresa_id,
      'Brijida Farinha',
      '0975349573',
      NULL,
      'brijida farinha'
    ),
    (
      v_empresa_id,
      'Brisa Di Pardo',
      '0981338905',
      NULL,
      'brisa di pardo'
    ),
    (
      v_empresa_id,
      'Brisa Florentin',
      '0971301663',
      NULL,
      'brisa florentin'
    ),
    (
      v_empresa_id,
      'Brisa Gimenez',
      '0971863086',
      NULL,
      'brisa gimenez'
    ),
    (
      v_empresa_id,
      'Brisa Osorio',
      '0987117871',
      NULL,
      'brisa osorio'
    ),
    (
      v_empresa_id,
      'Brisa Torres',
      '0992922373',
      '10mil',
      'brisa torres'
    ),
    (
      v_empresa_id,
      'Briza Ayala',
      '0991546714',
      NULL,
      'briza ayala'
    ),
    (
      v_empresa_id,
      'Bruna Ale',
      NULL,
      NULL,
      'bruna ale'
    ),
    (
      v_empresa_id,
      'Bruna Egevarth',
      '0973608605',
      '10mil',
      'bruna egevarth'
    ),
    (
      v_empresa_id,
      'Brunella Ayala',
      '0981870140',
      '30mil',
      'brunella ayala'
    ),
    (
      v_empresa_id,
      'Bruno Gimenez',
      '0994356785',
      '10mil',
      'bruno gimenez'
    ),
    (
      v_empresa_id,
      'Bryan Hildebran',
      '0972506019',
      '30MIL',
      'bryan hildebran'
    ),
    (
      v_empresa_id,
      'Buckets nena tienda',
      NULL,
      NULL,
      'buckets nena tienda'
    ),
    (
      v_empresa_id,
      'Bufandas Casa Monica',
      NULL,
      NULL,
      'bufandas casa monica'
    ),
    (
      v_empresa_id,
      'C',
      '0981627456',
      NULL,
      'c'
    ),
    (
      v_empresa_id,
      'Caludia Curi',
      '0992367717',
      NULL,
      'caludia curi'
    ),
    (
      v_empresa_id,
      'Camila Aguilar',
      '0984795574',
      NULL,
      'camila aguilar'
    ),
    (
      v_empresa_id,
      'Camila Amarilla',
      '0994697835',
      NULL,
      'camila amarilla'
    ),
    (
      v_empresa_id,
      'Camila Aponte',
      '0991286709',
      NULL,
      'camila aponte'
    ),
    (
      v_empresa_id,
      'Camila Auad',
      '0981947114',
      '10mil',
      'camila auad'
    ),
    (
      v_empresa_id,
      'Camila Aud',
      '0981947114',
      NULL,
      'camila aud'
    ),
    (
      v_empresa_id,
      'Camila Aveiro',
      '0981280793',
      NULL,
      'camila aveiro'
    ),
    (
      v_empresa_id,
      'Camila Barrail',
      '0991731061',
      NULL,
      'camila barrail'
    ),
    (
      v_empresa_id,
      'Camila Benitez',
      '0982875786',
      NULL,
      'camila benitez'
    ),
    (
      v_empresa_id,
      'Camila Bogado',
      '0983526024',
      NULL,
      'camila bogado'
    ),
    (
      v_empresa_id,
      'Camila Bogarin',
      '0976233824',
      NULL,
      'camila bogarin'
    ),
    (
      v_empresa_id,
      'Camila Caballero',
      '0982282032',
      NULL,
      'camila caballero'
    ),
    (
      v_empresa_id,
      'Camila Cardozo',
      '0981848696',
      NULL,
      'camila cardozo'
    ),
    (
      v_empresa_id,
      'Camila Chaparro',
      '0981869099',
      NULL,
      'camila chaparro'
    ),
    (
      v_empresa_id,
      'Camila Coronel',
      '0983170017',
      '10MIL',
      'camila coronel'
    ),
    (
      v_empresa_id,
      'Camila Curtido',
      '97666175',
      NULL,
      'camila curtido'
    ),
    (
      v_empresa_id,
      'Camila Echague',
      '0984871893',
      NULL,
      'camila echague'
    ),
    (
      v_empresa_id,
      'Camila Eschgfaller',
      '0983398376',
      NULL,
      'camila eschgfaller'
    ),
    (
      v_empresa_id,
      'Camila Espinola',
      '0976971445',
      NULL,
      'camila espinola'
    ),
    (
      v_empresa_id,
      'Camila Espinoza',
      '0986611537',
      '30mil',
      'camila espinoza'
    ),
    (
      v_empresa_id,
      'Camila Faeliponi',
      '0981830411',
      NULL,
      'camila faeliponi'
    ),
    (
      v_empresa_id,
      'Camila Fernandez',
      '0986233642',
      NULL,
      'camila fernandez'
    ),
    (
      v_empresa_id,
      'Camila Fleitas',
      '0986726688',
      '1 selo (2)',
      'camila fleitas'
    ),
    (
      v_empresa_id,
      'Camila Flor',
      '0991490478',
      '1 selo (1)',
      'camila flor'
    ),
    (
      v_empresa_id,
      'Camila Gaona',
      '0972762200',
      NULL,
      'camila gaona'
    ),
    (
      v_empresa_id,
      'Camila Gimenez',
      '0986282258',
      NULL,
      'camila gimenez'
    ),
    (
      v_empresa_id,
      'Camila Herken',
      '0971979598',
      NULL,
      'camila herken'
    ),
    (
      v_empresa_id,
      'Camila Irigolla',
      '0974221190',
      NULL,
      'camila irigolla'
    ),
    (
      v_empresa_id,
      'Camila Irigollo',
      '0974221190',
      NULL,
      'camila irigollo'
    ),
    (
      v_empresa_id,
      'Camila Ivarrola',
      '0991281815',
      NULL,
      'camila ivarrola'
    ),
    (
      v_empresa_id,
      'Camila Lopez',
      '0984901832',
      NULL,
      'camila lopez'
    ),
    (
      v_empresa_id,
      'Camila Mareco',
      '0984083618',
      NULL,
      'camila mareco'
    ),
    (
      v_empresa_id,
      'Camila Martinez',
      '0984531938',
      NULL,
      'camila martinez'
    ),
    (
      v_empresa_id,
      'Camila Mendoza',
      '0986155543',
      NULL,
      'camila mendoza'
    ),
    (
      v_empresa_id,
      'Camila Meza',
      '0987421668',
      NULL,
      'camila meza'
    ),
    (
      v_empresa_id,
      'Camila Mieres',
      '0984371499',
      NULL,
      'camila mieres'
    ),
    (
      v_empresa_id,
      'Camila Mora',
      '0994988005',
      NULL,
      'camila mora'
    ),
    (
      v_empresa_id,
      'Camila Neuui',
      '0986520813',
      NULL,
      'camila neuui'
    ),
    (
      v_empresa_id,
      'Camila Ocampos',
      '0981334298',
      '10mil',
      'camila ocampos'
    ),
    (
      v_empresa_id,
      'Camila Ortiz',
      '0985857548',
      NULL,
      'camila ortiz'
    ),
    (
      v_empresa_id,
      'Camila Ovaldo',
      '0981102535',
      NULL,
      'camila ovaldo'
    ),
    (
      v_empresa_id,
      'Camila Pereira',
      '0986396697',
      '1 selo (1)',
      'camila pereira'
    ),
    (
      v_empresa_id,
      'Camila Pino',
      '0984782106',
      NULL,
      'camila pino'
    ),
    (
      v_empresa_id,
      'Camila Prieto',
      '0981674754',
      NULL,
      'camila prieto'
    ),
    (
      v_empresa_id,
      'Camila Rivas',
      '0982120742',
      NULL,
      'camila rivas'
    ),
    (
      v_empresa_id,
      'Camila Roa',
      '0985487058',
      NULL,
      'camila roa'
    ),
    (
      v_empresa_id,
      'Camila Romero',
      '0971757360',
      NULL,
      'camila romero'
    ),
    (
      v_empresa_id,
      'Camila Salinas',
      '0982049406',
      NULL,
      'camila salinas'
    ),
    (
      v_empresa_id,
      'Camila Sanbria',
      '0983156170',
      NULL,
      'camila sanbria'
    ),
    (
      v_empresa_id,
      'Camila Silvero',
      '0984142001',
      NULL,
      'camila silvero'
    ),
    (
      v_empresa_id,
      'Camila sol baby',
      NULL,
      NULL,
      'camila sol baby'
    ),
    (
      v_empresa_id,
      'Camila Sotelo',
      '0986339573',
      NULL,
      'camila sotelo'
    ),
    (
      v_empresa_id,
      'Camila Thomson',
      '0982119135',
      NULL,
      'camila thomson'
    ),
    (
      v_empresa_id,
      'Camila Thonon',
      '0982119135',
      NULL,
      'camila thonon'
    ),
    (
      v_empresa_id,
      'Camila Torres',
      '0984379846',
      NULL,
      'camila torres'
    ),
    (
      v_empresa_id,
      'Camila Vasquez',
      '0994889627',
      NULL,
      'camila vasquez'
    ),
    (
      v_empresa_id,
      'Camila Vega',
      '0976363446',
      '30mil',
      'camila vega'
    ),
    (
      v_empresa_id,
      'Camila Vera',
      '0986408553',
      '10MIL',
      'camila vera'
    ),
    (
      v_empresa_id,
      'Camila Zapata',
      '0975602326',
      NULL,
      'camila zapata'
    ),
    (
      v_empresa_id,
      'Camilla Vazquez',
      '0994889627',
      NULL,
      'camilla vazquez'
    ),
    (
      v_empresa_id,
      'Candy Osorio',
      '0983335992',
      NULL,
      'candy osorio'
    ),
    (
      v_empresa_id,
      'Caren Carnoso',
      '0994159453',
      NULL,
      'caren carnoso'
    ),
    (
      v_empresa_id,
      'Caren Vega',
      '0981700114',
      NULL,
      'caren vega'
    ),
    (
      v_empresa_id,
      'Carina Livieres',
      '0981477525',
      NULL,
      'carina livieres'
    ),
    (
      v_empresa_id,
      'Carina Martini',
      '0982742382',
      NULL,
      'carina martini'
    ),
    (
      v_empresa_id,
      'Carine Toniau',
      '0994954784',
      NULL,
      'carine toniau'
    ),
    (
      v_empresa_id,
      'Carla Casola',
      '0981431244',
      '10mil',
      'carla casola'
    ),
    (
      v_empresa_id,
      'Carla Penayo',
      '0982160641',
      NULL,
      'carla penayo'
    ),
    (
      v_empresa_id,
      'Carlos Alfonso',
      '0971971270',
      NULL,
      'carlos alfonso'
    ),
    (
      v_empresa_id,
      'Carlos Ascurra',
      '0983251087',
      NULL,
      'carlos ascurra'
    ),
    (
      v_empresa_id,
      'Carlos Avalos',
      '0983727400',
      '30mil',
      'carlos avalos'
    ),
    (
      v_empresa_id,
      'Carlos Benitez',
      '86581756',
      NULL,
      'carlos benitez'
    ),
    (
      v_empresa_id,
      'Carlos Busto',
      '0982710903',
      NULL,
      'carlos busto'
    ),
    (
      v_empresa_id,
      'Carlos Ferreira',
      '0991689309',
      NULL,
      'carlos ferreira'
    ),
    (
      v_empresa_id,
      'Carlos Flecha',
      '0972690303',
      NULL,
      'carlos flecha'
    ),
    (
      v_empresa_id,
      'Carlos Gavilan',
      '0981226573',
      NULL,
      'carlos gavilan'
    ),
    (
      v_empresa_id,
      'Carlos Nunez',
      '0972675001',
      NULL,
      'carlos nunez'
    ),
    (
      v_empresa_id,
      'Carlos Ohiggins',
      '0986193225',
      NULL,
      'carlos ohiggins'
    ),
    (
      v_empresa_id,
      'Carlos Ohiguins',
      NULL,
      NULL,
      'carlos ohiguins'
    ),
    (
      v_empresa_id,
      'Carlos Ohindinss',
      '0985328304',
      NULL,
      'carlos ohindinss'
    ),
    (
      v_empresa_id,
      'Carlos Ortega',
      '0986172283',
      '10MIL',
      'carlos ortega'
    ),
    (
      v_empresa_id,
      'Carlos Santacruz',
      '0961589011',
      '1 selo (1)',
      'carlos santacruz'
    ),
    (
      v_empresa_id,
      'Carlos Servin',
      '0982100027',
      NULL,
      'carlos servin'
    ),
    (
      v_empresa_id,
      'Carlos silvero',
      '0981411416',
      NULL,
      'carlos silvero'
    ),
    (
      v_empresa_id,
      'Carlos Vazquez',
      '0971951506',
      NULL,
      'carlos vazquez'
    ),
    (
      v_empresa_id,
      'Carlosa Martine Espinola',
      '0981386426',
      NULL,
      'carlosa martine espinola'
    ),
    (
      v_empresa_id,
      'Carmen Acosta',
      '0981105523',
      NULL,
      'carmen acosta'
    ),
    (
      v_empresa_id,
      'Carmen Aguero',
      NULL,
      NULL,
      'carmen aguero'
    ),
    (
      v_empresa_id,
      'Carmen Alderete',
      '0991657074',
      NULL,
      'carmen alderete'
    ),
    (
      v_empresa_id,
      'Carmen Alonzo',
      '0981169147',
      '30MIL',
      'carmen alonzo'
    ),
    (
      v_empresa_id,
      'Carmen Arguello',
      '0991222079',
      NULL,
      'carmen arguello'
    ),
    (
      v_empresa_id,
      'Carmen Avalos',
      '0981422408',
      NULL,
      'carmen avalos'
    ),
    (
      v_empresa_id,
      'Carmen Bobadilla',
      '0984993299',
      NULL,
      'carmen bobadilla'
    ),
    (
      v_empresa_id,
      'Carmen Boselli',
      '0976302892',
      NULL,
      'carmen boselli'
    ),
    (
      v_empresa_id,
      'Carmen Cabanas',
      '0985962124',
      NULL,
      'carmen cabanas'
    ),
    (
      v_empresa_id,
      'Carmen Cabanhas',
      '0985962124',
      NULL,
      'carmen cabanhas'
    ),
    (
      v_empresa_id,
      'Carmen Cabrera',
      '0971195941',
      NULL,
      'carmen cabrera'
    ),
    (
      v_empresa_id,
      'Carmen Chamorro',
      '0982200359',
      NULL,
      'carmen chamorro'
    ),
    (
      v_empresa_id,
      'Carmen Diaz',
      '0971128221',
      NULL,
      'carmen diaz'
    ),
    (
      v_empresa_id,
      'Carmen Duarte',
      '0976813205',
      '1 selo (4)',
      'carmen duarte'
    ),
    (
      v_empresa_id,
      'Carmen Fernandez',
      '0982932379',
      NULL,
      'carmen fernandez'
    ),
    (
      v_empresa_id,
      'Carmen Fleitas',
      '0983067212',
      NULL,
      'carmen fleitas'
    ),
    (
      v_empresa_id,
      'Carmen Genez',
      '0981941071',
      NULL,
      'carmen genez'
    ),
    (
      v_empresa_id,
      'Carmen Ibarra',
      '0991307960',
      NULL,
      'carmen ibarra'
    ),
    (
      v_empresa_id,
      'Carmen Jarolin',
      '0981384755',
      NULL,
      'carmen jarolin'
    ),
    (
      v_empresa_id,
      'Carmen Leguizamon',
      '0992215988',
      '10mil',
      'carmen leguizamon'
    ),
    (
      v_empresa_id,
      'Carmen Martinez',
      '0994407464',
      NULL,
      'carmen martinez'
    ),
    (
      v_empresa_id,
      'Carmen Miranda',
      '0981801430',
      NULL,
      'carmen miranda'
    ),
    (
      v_empresa_id,
      'Carmen Parini',
      '0981601427',
      NULL,
      'carmen parini'
    ),
    (
      v_empresa_id,
      'Carmen Rojas',
      '0994567588',
      NULL,
      'carmen rojas'
    ),
    (
      v_empresa_id,
      'Carmen Torres',
      '0975495252',
      NULL,
      'carmen torres'
    ),
    (
      v_empresa_id,
      'Carmen Vera',
      '0994399649',
      '1 selo (2)',
      'carmen vera'
    ),
    (
      v_empresa_id,
      'Carmen Zaracho',
      '0985415210',
      NULL,
      'carmen zaracho'
    ),
    (
      v_empresa_id,
      'Carneb Aquino',
      '0971124959',
      NULL,
      'carneb aquino'
    ),
    (
      v_empresa_id,
      'Carolina',
      NULL,
      NULL,
      'carolina'
    ),
    (
      v_empresa_id,
      'Carolina Alvarenga',
      '0961631206',
      NULL,
      'carolina alvarenga'
    ),
    (
      v_empresa_id,
      'Carolina Bento',
      '0982615609',
      '10mil',
      'carolina bento'
    ),
    (
      v_empresa_id,
      'Carolina Blanco',
      '9852532530',
      NULL,
      'carolina blanco'
    ),
    (
      v_empresa_id,
      'Carolina Canez',
      '0982828665',
      '10MIL',
      'carolina canez'
    ),
    (
      v_empresa_id,
      'Carolina Choi',
      '0987440186',
      NULL,
      'carolina choi'
    ),
    (
      v_empresa_id,
      'Carolina Collante',
      '0992285484',
      NULL,
      'carolina collante'
    ),
    (
      v_empresa_id,
      'Carolina Cristina ramirez',
      '0981623707',
      '1 selo (1)',
      'carolina cristina ramirez'
    ),
    (
      v_empresa_id,
      'Carolina Diarte',
      '0984707061',
      NULL,
      'carolina diarte'
    ),
    (
      v_empresa_id,
      'Carolina Escurra',
      '0986409119',
      '10MIL',
      'carolina escurra'
    ),
    (
      v_empresa_id,
      'Carolina Galeano',
      '0994252532',
      NULL,
      'carolina galeano'
    ),
    (
      v_empresa_id,
      'Carolina Ibarra',
      '0971933635',
      NULL,
      'carolina ibarra'
    ),
    (
      v_empresa_id,
      'Carolina Irrasabal',
      '0981848490',
      NULL,
      'carolina irrasabal'
    ),
    (
      v_empresa_id,
      'Carolina Lopez',
      '0972700669',
      NULL,
      'carolina lopez'
    ),
    (
      v_empresa_id,
      'Carolina Martinez',
      '0972731900',
      NULL,
      'carolina martinez'
    ),
    (
      v_empresa_id,
      'Carolina Massari',
      '0961816600',
      NULL,
      'carolina massari'
    ),
    (
      v_empresa_id,
      'Carolina Miranda',
      '0981812443',
      NULL,
      'carolina miranda'
    ),
    (
      v_empresa_id,
      'Carolina Noguera',
      '0994882346',
      NULL,
      'carolina noguera'
    ),
    (
      v_empresa_id,
      'Carolina Nunez',
      '0981952076',
      NULL,
      'carolina nunez'
    ),
    (
      v_empresa_id,
      'Carolina Pereira',
      '0991463575',
      NULL,
      'carolina pereira'
    ),
    (
      v_empresa_id,
      'Carolina Rivas',
      '0971255988',
      '10mil',
      'carolina rivas'
    ),
    (
      v_empresa_id,
      'Carolina Rojas',
      '0971277276',
      NULL,
      'carolina rojas'
    ),
    (
      v_empresa_id,
      'Carolina Santibiago',
      '0961810405',
      NULL,
      'carolina santibiago'
    ),
    (
      v_empresa_id,
      'Carolina Vazquez',
      '0971523982',
      NULL,
      'carolina vazquez'
    ),
    (
      v_empresa_id,
      'Carolina Vera',
      '0971398009',
      NULL,
      'carolina vera'
    ),
    (
      v_empresa_id,
      'Carolina Zaarate',
      '0982248732',
      '10MIL',
      'carolina zaarate'
    ),
    (
      v_empresa_id,
      'Casa Angela',
      NULL,
      NULL,
      'casa angela'
    ),
    (
      v_empresa_id,
      'Casa Monica',
      NULL,
      NULL,
      'casa monica'
    ),
    (
      v_empresa_id,
      'Casa Monica (bodys)',
      NULL,
      NULL,
      'casa monica (bodys)'
    ),
    (
      v_empresa_id,
      'Casterina Reyes',
      '0981541286',
      NULL,
      'casterina reyes'
    ),
    (
      v_empresa_id,
      'Catalina Estigarribia',
      '0983896066',
      NULL,
      'catalina estigarribia'
    ),
    (
      v_empresa_id,
      'Catalina Orrego',
      '0984335345',
      NULL,
      'catalina orrego'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 3: filas 1001..1500
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Cathya Acosta',
      '0982109756',
      '1 selo (1)',
      'cathya acosta'
    ),
    (
      v_empresa_id,
      'Catia Acosta',
      '0982109757',
      NULL,
      'catia acosta'
    ),
    (
      v_empresa_id,
      'Catia Adorno',
      '0986714579',
      NULL,
      'catia adorno'
    ),
    (
      v_empresa_id,
      'Catia Lopez',
      '0994495883',
      NULL,
      'catia lopez'
    ),
    (
      v_empresa_id,
      'Catia Segovis',
      '0985911716',
      NULL,
      'catia segovis'
    ),
    (
      v_empresa_id,
      'Cecia Caballero',
      '0971942196',
      NULL,
      'cecia caballero'
    ),
    (
      v_empresa_id,
      'Cecilia Acevedo',
      '0981179890',
      NULL,
      'cecilia acevedo'
    ),
    (
      v_empresa_id,
      'Cecilia Acosta',
      '0992708923',
      NULL,
      'cecilia acosta'
    ),
    (
      v_empresa_id,
      'Cecilia Aguilera',
      '0991246819',
      NULL,
      'cecilia aguilera'
    ),
    (
      v_empresa_id,
      'Cecilia Araujo',
      '0981661161',
      NULL,
      'cecilia araujo'
    ),
    (
      v_empresa_id,
      'Cecilia Ayala',
      '0981498482',
      NULL,
      'cecilia ayala'
    ),
    (
      v_empresa_id,
      'Cecilia Azuca',
      '0982122985',
      '1 selo (1)',
      'cecilia azuca'
    ),
    (
      v_empresa_id,
      'Cecilia Barrios',
      '0982512028',
      NULL,
      'cecilia barrios'
    ),
    (
      v_empresa_id,
      'Cecilia Bavera',
      '0984980885',
      NULL,
      'cecilia bavera'
    ),
    (
      v_empresa_id,
      'Cecilia Behage',
      '0991850077',
      NULL,
      'cecilia behage'
    ),
    (
      v_empresa_id,
      'Cecilia Benitez',
      '0971680746',
      NULL,
      'cecilia benitez'
    ),
    (
      v_empresa_id,
      'Cecilia Burges',
      '0983919412',
      NULL,
      'cecilia burges'
    ),
    (
      v_empresa_id,
      'Cecilia Chaparro',
      '0981781080',
      NULL,
      'cecilia chaparro'
    ),
    (
      v_empresa_id,
      'Cecilia Espinoza',
      '0983415731',
      '10mil',
      'cecilia espinoza'
    ),
    (
      v_empresa_id,
      'Cecilia Flores',
      '0982636683',
      NULL,
      'cecilia flores'
    ),
    (
      v_empresa_id,
      'Cecilia Gonzalez',
      '0984210459',
      NULL,
      'cecilia gonzalez'
    ),
    (
      v_empresa_id,
      'Cecilia Guerero',
      '0985147976',
      '1 selo (1)',
      'cecilia guerero'
    ),
    (
      v_empresa_id,
      'Cecilia Kim',
      '0985446925',
      '20MIL',
      'cecilia kim'
    ),
    (
      v_empresa_id,
      'Cecilia Kym',
      '0985446925',
      NULL,
      'cecilia kym'
    ),
    (
      v_empresa_id,
      'Cecilia Lugo',
      '0985804999',
      NULL,
      'cecilia lugo'
    ),
    (
      v_empresa_id,
      'Cecilia Melgarejo',
      '0973144631',
      NULL,
      'cecilia melgarejo'
    ),
    (
      v_empresa_id,
      'Cecilia Mendoza',
      '0976137630',
      NULL,
      'cecilia mendoza'
    ),
    (
      v_empresa_id,
      'Cecilia Montiel',
      '0972693599',
      NULL,
      'cecilia montiel'
    ),
    (
      v_empresa_id,
      'Cecilia Moreira',
      '0981834481',
      NULL,
      'cecilia moreira'
    ),
    (
      v_empresa_id,
      'Cecilia Muñoz',
      '0981807608',
      NULL,
      'cecilia muñoz'
    ),
    (
      v_empresa_id,
      'Cecilia Otazo',
      '0983467873',
      NULL,
      'cecilia otazo'
    ),
    (
      v_empresa_id,
      'Cecilia Quevedo',
      '0981472825',
      NULL,
      'cecilia quevedo'
    ),
    (
      v_empresa_id,
      'Cecilia Rejala',
      '0981266046',
      NULL,
      'cecilia rejala'
    ),
    (
      v_empresa_id,
      'Cecilia Rodriguez',
      '9712201761',
      NULL,
      'cecilia rodriguez'
    ),
    (
      v_empresa_id,
      'Cecilia rRejala',
      '0981266046',
      NULL,
      'cecilia rrejala'
    ),
    (
      v_empresa_id,
      'Cecilia Sanabria',
      '0985357279',
      NULL,
      'cecilia sanabria'
    ),
    (
      v_empresa_id,
      'Cecilia Silvera',
      '0984100150',
      NULL,
      'cecilia silvera'
    ),
    (
      v_empresa_id,
      'Cecilia Torres',
      '0991227077',
      NULL,
      'cecilia torres'
    ),
    (
      v_empresa_id,
      'Cecilia Ubeda',
      '0975622070',
      NULL,
      'cecilia ubeda'
    ),
    (
      v_empresa_id,
      'Cecilia Valdovinos',
      '0981457030',
      NULL,
      'cecilia valdovinos'
    ),
    (
      v_empresa_id,
      'Cecilia Vera',
      '0981312181',
      NULL,
      'cecilia vera'
    ),
    (
      v_empresa_id,
      'Cecilia Villalba',
      '0981848494',
      '10mil',
      'cecilia villalba'
    ),
    (
      v_empresa_id,
      'Cecilio Sosa',
      '0982022734',
      '20mil',
      'cecilio sosa'
    ),
    (
      v_empresa_id,
      'Ceculia Mendoza',
      '0976137630',
      NULL,
      'ceculia mendoza'
    ),
    (
      v_empresa_id,
      'Celedonia Martinez',
      '0981644086',
      NULL,
      'celedonia martinez'
    ),
    (
      v_empresa_id,
      'Celen Caballero',
      '0981768739',
      NULL,
      'celen caballero'
    ),
    (
      v_empresa_id,
      'Celena Rodriguez Garcia',
      '0991421241',
      '40mil',
      'celena rodriguez garcia'
    ),
    (
      v_empresa_id,
      'Celeste Baez',
      '0972569740',
      NULL,
      'celeste baez'
    ),
    (
      v_empresa_id,
      'Celeste Cabanas',
      '0994359886',
      NULL,
      'celeste cabanas'
    ),
    (
      v_empresa_id,
      'Celeste Centurion',
      '0971850351',
      NULL,
      'celeste centurion'
    ),
    (
      v_empresa_id,
      'Celeste Florentin',
      '0984794318',
      NULL,
      'celeste florentin'
    ),
    (
      v_empresa_id,
      'Celeste Gimenez',
      '0971640047',
      NULL,
      'celeste gimenez'
    ),
    (
      v_empresa_id,
      'Celeste Gonzalez',
      '0971609136',
      NULL,
      'celeste gonzalez'
    ),
    (
      v_empresa_id,
      'Celeste Irala',
      '0981902647',
      NULL,
      'celeste irala'
    ),
    (
      v_empresa_id,
      'Celeste Mayorquin',
      '0982721657',
      NULL,
      'celeste mayorquin'
    ),
    (
      v_empresa_id,
      'Celeste Rodas',
      '0971565148',
      NULL,
      'celeste rodas'
    ),
    (
      v_empresa_id,
      'Celeste Roig',
      '0981286406',
      NULL,
      'celeste roig'
    ),
    (
      v_empresa_id,
      'Celeste Ruiz Diaz',
      '0981135432',
      NULL,
      'celeste ruiz diaz'
    ),
    (
      v_empresa_id,
      'Celeste Trigo',
      '0961861069',
      NULL,
      'celeste trigo'
    ),
    (
      v_empresa_id,
      'Celeste Ughelli',
      '0983216654',
      NULL,
      'celeste ughelli'
    ),
    (
      v_empresa_id,
      'Celeste Villalba',
      '0981862863',
      NULL,
      'celeste villalba'
    ),
    (
      v_empresa_id,
      'Celia Ayala',
      '0991329339',
      NULL,
      'celia ayala'
    ),
    (
      v_empresa_id,
      'Celia Brites',
      '0961824339',
      NULL,
      'celia brites'
    ),
    (
      v_empresa_id,
      'Celia Espinola',
      '0984669500',
      '10mil',
      'celia espinola'
    ),
    (
      v_empresa_id,
      'Celia Franco',
      '0984343476',
      NULL,
      'celia franco'
    ),
    (
      v_empresa_id,
      'Celia Gomez',
      '0986829620',
      NULL,
      'celia gomez'
    ),
    (
      v_empresa_id,
      'Celida Gonzalez',
      '0971557580',
      NULL,
      'celida gonzalez'
    ),
    (
      v_empresa_id,
      'Celilia Arau',
      '0981661160',
      NULL,
      'celilia arau'
    ),
    (
      v_empresa_id,
      'Celina Esoinila',
      '0975394490',
      NULL,
      'celina esoinila'
    ),
    (
      v_empresa_id,
      'Cenia Gonzalez',
      '0982870376',
      NULL,
      'cenia gonzalez'
    ),
    (
      v_empresa_id,
      'Cesar',
      NULL,
      NULL,
      'cesar'
    ),
    (
      v_empresa_id,
      'Cesar Avalos',
      '0976397809',
      NULL,
      'cesar avalos'
    ),
    (
      v_empresa_id,
      'Cesar Escobar',
      '0972207030',
      NULL,
      'cesar escobar'
    ),
    (
      v_empresa_id,
      'Cesar Izquierdo',
      '0981748652',
      NULL,
      'cesar izquierdo'
    ),
    (
      v_empresa_id,
      'Cesar Torres',
      '0981372732',
      NULL,
      'cesar torres'
    ),
    (
      v_empresa_id,
      'Ceudi Ojeda',
      '0994700859',
      '10mil',
      'ceudi ojeda'
    ),
    (
      v_empresa_id,
      'Chantal Vallejo',
      '0974289869',
      NULL,
      'chantal vallejo'
    ),
    (
      v_empresa_id,
      'Charlotte Dumoulin',
      '34486031153',
      NULL,
      'charlotte dumoulin'
    ),
    (
      v_empresa_id,
      'Chiara Ostertag',
      '0983729200',
      NULL,
      'chiara ostertag'
    ),
    (
      v_empresa_id,
      'Christian Ibarrola',
      '0982296751',
      NULL,
      'christian ibarrola'
    ),
    (
      v_empresa_id,
      'Christian Pita',
      '0981607378',
      NULL,
      'christian pita'
    ),
    (
      v_empresa_id,
      'Cibele Chiattone',
      '0994716754',
      NULL,
      'cibele chiattone'
    ),
    (
      v_empresa_id,
      'Cielo Perez',
      '0986240326',
      NULL,
      'cielo perez'
    ),
    (
      v_empresa_id,
      'Cindi Indart',
      '0975535703',
      NULL,
      'cindi indart'
    ),
    (
      v_empresa_id,
      'Cindia Llanes',
      '0981423180',
      NULL,
      'cindia llanes'
    ),
    (
      v_empresa_id,
      'Cindia Martinez',
      '0993486440',
      NULL,
      'cindia martinez'
    ),
    (
      v_empresa_id,
      'Cindy',
      NULL,
      NULL,
      'cindy'
    ),
    (
      v_empresa_id,
      'Cindy Coronel',
      '0992662026',
      NULL,
      'cindy coronel'
    ),
    (
      v_empresa_id,
      'Cindy Leiva',
      '0973598989',
      NULL,
      'cindy leiva'
    ),
    (
      v_empresa_id,
      'Cinthia Benitez',
      '0971919750',
      NULL,
      'cinthia benitez'
    ),
    (
      v_empresa_id,
      'Cinthia Coleman',
      '0971247744',
      NULL,
      'cinthia coleman'
    ),
    (
      v_empresa_id,
      'Cinthia Coronel',
      '0991612023',
      NULL,
      'cinthia coronel'
    ),
    (
      v_empresa_id,
      'Cinthia Cristaldo',
      '0972198458',
      NULL,
      'cinthia cristaldo'
    ),
    (
      v_empresa_id,
      'Cinthia Cristaldo Zarate',
      '0981758855',
      NULL,
      'cinthia cristaldo zarate'
    ),
    (
      v_empresa_id,
      'Cinthia Escobar',
      '0985755657',
      NULL,
      'cinthia escobar'
    ),
    (
      v_empresa_id,
      'Cinthia Estigarria',
      '0986648100',
      NULL,
      'cinthia estigarria'
    ),
    (
      v_empresa_id,
      'Cinthia Fernandez',
      '0985794396',
      '1 selo (1)',
      'cinthia fernandez'
    ),
    (
      v_empresa_id,
      'Cinthia Galeano',
      '0972213637',
      NULL,
      'cinthia galeano'
    ),
    (
      v_empresa_id,
      'Cinthia Iglesias',
      '0986728575',
      NULL,
      'cinthia iglesias'
    ),
    (
      v_empresa_id,
      'Cinthia Lopez',
      '0981237556',
      NULL,
      'cinthia lopez'
    ),
    (
      v_empresa_id,
      'Cinthia Piedrabuena',
      '0975775145',
      '10mil',
      'cinthia piedrabuena'
    ),
    (
      v_empresa_id,
      'Cinthia Rodriguez',
      '0981953267',
      NULL,
      'cinthia rodriguez'
    ),
    (
      v_empresa_id,
      'Cinthia Rojas',
      '0994346158',
      NULL,
      'cinthia rojas'
    ),
    (
      v_empresa_id,
      'Cinthia Romero',
      '0991441255',
      NULL,
      'cinthia romero'
    ),
    (
      v_empresa_id,
      'Cinthia Samudio',
      '0994359548',
      NULL,
      'cinthia samudio'
    ),
    (
      v_empresa_id,
      'Cinthia Sosa',
      '0985293595',
      NULL,
      'cinthia sosa'
    ),
    (
      v_empresa_id,
      'Cinthia Ulianow',
      NULL,
      NULL,
      'cinthia ulianow'
    ),
    (
      v_empresa_id,
      'Cinthia Vega',
      '0984658139',
      NULL,
      'cinthia vega'
    ),
    (
      v_empresa_id,
      'Cinthia Zeballos',
      '0981681967',
      NULL,
      'cinthia zeballos'
    ),
    (
      v_empresa_id,
      'Cinthya',
      NULL,
      NULL,
      'cinthya'
    ),
    (
      v_empresa_id,
      'Cinthya Basualdo',
      '0983694367',
      NULL,
      'cinthya basualdo'
    ),
    (
      v_empresa_id,
      'Cinthya Franco',
      '0971394986',
      NULL,
      'cinthya franco'
    ),
    (
      v_empresa_id,
      'Cinthya Mino',
      '0971896740',
      NULL,
      'cinthya mino'
    ),
    (
      v_empresa_id,
      'Cinthya Romero',
      '0981149464',
      NULL,
      'cinthya romero'
    ),
    (
      v_empresa_id,
      'Cinthya Sarabia',
      '0981860349',
      NULL,
      'cinthya sarabia'
    ),
    (
      v_empresa_id,
      'Cinthya Segovia',
      '0971323046',
      NULL,
      'cinthya segovia'
    ),
    (
      v_empresa_id,
      'Cintia Chaparro',
      '0983622048',
      NULL,
      'cintia chaparro'
    ),
    (
      v_empresa_id,
      'Cintia Sanabria',
      '0981860349',
      '10mil',
      'cintia sanabria'
    ),
    (
      v_empresa_id,
      'Cintia Silva',
      '0981413071',
      NULL,
      'cintia silva'
    ),
    (
      v_empresa_id,
      'Cintia Tan',
      '0985720049',
      NULL,
      'cintia tan'
    ),
    (
      v_empresa_id,
      'Cintia Vega',
      '0985944453',
      NULL,
      'cintia vega'
    ),
    (
      v_empresa_id,
      'Cintia Villamayor',
      '0981445978',
      NULL,
      'cintia villamayor'
    ),
    (
      v_empresa_id,
      'Cithia Lopez',
      '0981215905',
      NULL,
      'cithia lopez'
    ),
    (
      v_empresa_id,
      'Cithia Vera',
      '0981436275',
      NULL,
      'cithia vera'
    ),
    (
      v_empresa_id,
      'Ciynthia Gonzalez',
      '0991549394',
      '30mil',
      'ciynthia gonzalez'
    ),
    (
      v_empresa_id,
      'Clara Acuna',
      '0981907057',
      NULL,
      'clara acuna'
    ),
    (
      v_empresa_id,
      'clara Alarcon',
      '0991415800',
      NULL,
      'clara alarcon'
    ),
    (
      v_empresa_id,
      'Clara Aranda',
      '0981287300',
      NULL,
      'clara aranda'
    ),
    (
      v_empresa_id,
      'Clara Ayala',
      '0972199783',
      NULL,
      'clara ayala'
    ),
    (
      v_empresa_id,
      'Clara Benitez',
      '0971742859',
      NULL,
      'clara benitez'
    ),
    (
      v_empresa_id,
      'Clara Bernal',
      '0984156574',
      NULL,
      'clara bernal'
    ),
    (
      v_empresa_id,
      'Clara Carvallo',
      '0991601725',
      NULL,
      'clara carvallo'
    ),
    (
      v_empresa_id,
      'Clara Gonzalez',
      '0983296312',
      NULL,
      'clara gonzalez'
    ),
    (
      v_empresa_id,
      'Clara Jara',
      '0973684878',
      '10mil',
      'clara jara'
    ),
    (
      v_empresa_id,
      'Clara Mendez',
      '0985508656',
      NULL,
      'clara mendez'
    ),
    (
      v_empresa_id,
      'Clara Rodas',
      '0983580592',
      NULL,
      'clara rodas'
    ),
    (
      v_empresa_id,
      'Clara Solis',
      '0981243082',
      NULL,
      'clara solis'
    ),
    (
      v_empresa_id,
      'Clara Sotelo',
      '0982669450',
      NULL,
      'clara sotelo'
    ),
    (
      v_empresa_id,
      'Clara Zarza',
      '0976171298',
      '10MIL',
      'clara zarza'
    ),
    (
      v_empresa_id,
      'Clarisa Aseretto',
      '0983586053',
      NULL,
      'clarisa aseretto'
    ),
    (
      v_empresa_id,
      'Clarisa Bareiro',
      '0993551460',
      NULL,
      'clarisa bareiro'
    ),
    (
      v_empresa_id,
      'Clau Humbeck',
      '0983313100',
      NULL,
      'clau humbeck'
    ),
    (
      v_empresa_id,
      'Claudelina Chavez',
      '0985164442',
      '10mil',
      'claudelina chavez'
    ),
    (
      v_empresa_id,
      'Claudia',
      '0982373435',
      NULL,
      'claudia'
    ),
    (
      v_empresa_id,
      'Claudia Acosta',
      '0983337296',
      NULL,
      'claudia acosta'
    ),
    (
      v_empresa_id,
      'Claudia Amarilla',
      '0981114878',
      '20mil',
      'claudia amarilla'
    ),
    (
      v_empresa_id,
      'Claudia Arce',
      '0961811249',
      NULL,
      'claudia arce'
    ),
    (
      v_empresa_id,
      'Claudia Ayala',
      '0972466854',
      NULL,
      'claudia ayala'
    ),
    (
      v_empresa_id,
      'Claudia Baezque',
      '0982782691',
      NULL,
      'claudia baezque'
    ),
    (
      v_empresa_id,
      'Claudia Benitez',
      '0986703183',
      NULL,
      'claudia benitez'
    ),
    (
      v_empresa_id,
      'Claudia Britez',
      '0971508595',
      NULL,
      'claudia britez'
    ),
    (
      v_empresa_id,
      'Claudia Caceres',
      '0982373435',
      '60mil',
      'claudia caceres'
    ),
    (
      v_empresa_id,
      'Claudia Centurion',
      '0986200940',
      NULL,
      'claudia centurion'
    ),
    (
      v_empresa_id,
      'Claudia Cespedes',
      '0983176633',
      NULL,
      'claudia cespedes'
    ),
    (
      v_empresa_id,
      'Claudia Chaparro',
      '0991183904',
      NULL,
      'claudia chaparro'
    ),
    (
      v_empresa_id,
      'Claudia Davalos',
      '0991426521',
      NULL,
      'claudia davalos'
    ),
    (
      v_empresa_id,
      'Claudia Fernandez',
      '0971262863',
      NULL,
      'claudia fernandez'
    ),
    (
      v_empresa_id,
      'Claudia Ferreira',
      '0983466598',
      '20mil',
      'claudia ferreira'
    ),
    (
      v_empresa_id,
      'Claudia Ferrerira',
      '0983466598',
      NULL,
      'claudia ferrerira'
    ),
    (
      v_empresa_id,
      'Claudia Fugarazzo',
      '0983731073',
      '10mil',
      'claudia fugarazzo'
    ),
    (
      v_empresa_id,
      'Claudia Gallardo',
      '0981703032',
      NULL,
      'claudia gallardo'
    ),
    (
      v_empresa_id,
      'Claudia Gomez',
      '0991354431',
      NULL,
      'claudia gomez'
    ),
    (
      v_empresa_id,
      'Claudia Gonzalez',
      '0987187401',
      NULL,
      'claudia gonzalez'
    ),
    (
      v_empresa_id,
      'Claudia Guanes',
      '0981200904',
      '10mil',
      'claudia guanes'
    ),
    (
      v_empresa_id,
      'Claudia Leiva',
      '0981759496',
      NULL,
      'claudia leiva'
    ),
    (
      v_empresa_id,
      'Claudia Lezcano',
      '0984425412',
      NULL,
      'claudia lezcano'
    ),
    (
      v_empresa_id,
      'Claudia Martinez',
      '0982665010',
      '10mil',
      'claudia martinez'
    ),
    (
      v_empresa_id,
      'Claudia medina',
      '9724911664',
      NULL,
      'claudia medina'
    ),
    (
      v_empresa_id,
      'Claudia Monse',
      '0981248925',
      '10mil',
      'claudia monse'
    ),
    (
      v_empresa_id,
      'Claudia Pena',
      '0982756652',
      NULL,
      'claudia pena'
    ),
    (
      v_empresa_id,
      'Claudia Popiw',
      '0983064440',
      NULL,
      'claudia popiw'
    ),
    (
      v_empresa_id,
      'Claudia Quintana',
      '0985886704',
      NULL,
      'claudia quintana'
    ),
    (
      v_empresa_id,
      'Claudia Riveros',
      '0985662723',
      NULL,
      'claudia riveros'
    ),
    (
      v_empresa_id,
      'Claudia Rocha',
      '0971949195',
      NULL,
      'claudia rocha'
    ),
    (
      v_empresa_id,
      'Claudia Rolon',
      '0984512534',
      NULL,
      'claudia rolon'
    ),
    (
      v_empresa_id,
      'Claudia Soto',
      '0985786000',
      '1 selo (1)',
      'claudia soto'
    ),
    (
      v_empresa_id,
      'Claudia Talavera',
      '0984411523',
      NULL,
      'claudia talavera'
    ),
    (
      v_empresa_id,
      'Claudia Vaezquen',
      '0982782691',
      NULL,
      'claudia vaezquen'
    ),
    (
      v_empresa_id,
      'Claudia Villala',
      '0985915575',
      NULL,
      'claudia villala'
    ),
    (
      v_empresa_id,
      'Claudia Villalba',
      '0987357367',
      NULL,
      'claudia villalba'
    ),
    (
      v_empresa_id,
      'Claudio Bardella',
      '0981640310',
      NULL,
      'claudio bardella'
    ),
    (
      v_empresa_id,
      'Clebentina Gomez',
      '0994289726',
      NULL,
      'clebentina gomez'
    ),
    (
      v_empresa_id,
      'Clementina Gomez',
      '0994289726',
      NULL,
      'clementina gomez'
    ),
    (
      v_empresa_id,
      'Concepcion Espinola',
      '0981463886',
      '30mil',
      'concepcion espinola'
    ),
    (
      v_empresa_id,
      'Concepcion Mora',
      '0983138787',
      NULL,
      'concepcion mora'
    ),
    (
      v_empresa_id,
      'Corina Acuna',
      '0991788226',
      NULL,
      'corina acuna'
    ),
    (
      v_empresa_id,
      'Corina Mieles',
      '0976660220',
      NULL,
      'corina mieles'
    ),
    (
      v_empresa_id,
      'Corina Pereira',
      '0981969108',
      NULL,
      'corina pereira'
    ),
    (
      v_empresa_id,
      'Crisitina Galeano',
      NULL,
      NULL,
      'crisitina galeano'
    ),
    (
      v_empresa_id,
      'Crisley Figueiredo',
      '0972249335',
      NULL,
      'crisley figueiredo'
    ),
    (
      v_empresa_id,
      'Cristal Amarilla',
      '0981456182',
      NULL,
      'cristal amarilla'
    ),
    (
      v_empresa_id,
      'Cristel Arevalos',
      '0991923168',
      '30mil',
      'cristel arevalos'
    ),
    (
      v_empresa_id,
      'Cristhian Benitez',
      '0972164031',
      NULL,
      'cristhian benitez'
    ),
    (
      v_empresa_id,
      'Cristhian Bogarin',
      '0981858991',
      NULL,
      'cristhian bogarin'
    ),
    (
      v_empresa_id,
      'Cristhian Cristaldo',
      '0981256122',
      NULL,
      'cristhian cristaldo'
    ),
    (
      v_empresa_id,
      'Cristhian Gonzalez',
      '0975484285',
      NULL,
      'cristhian gonzalez'
    ),
    (
      v_empresa_id,
      'Cristhian Medina',
      '0985113763',
      '20mil',
      'cristhian medina'
    ),
    (
      v_empresa_id,
      'Cristhian Mercado',
      '0982517875',
      NULL,
      'cristhian mercado'
    ),
    (
      v_empresa_id,
      'Cristhian Mongelos',
      '0976172611',
      '1 selo (1)',
      'cristhian mongelos'
    ),
    (
      v_empresa_id,
      'Cristhian Scebba',
      '0994953207',
      NULL,
      'cristhian scebba'
    ),
    (
      v_empresa_id,
      'Cristian',
      NULL,
      NULL,
      'cristian'
    ),
    (
      v_empresa_id,
      'Cristian Alfredo Gauto',
      '0971509951',
      NULL,
      'cristian alfredo gauto'
    ),
    (
      v_empresa_id,
      'Cristian Brisuela',
      '0991773297',
      NULL,
      'cristian brisuela'
    ),
    (
      v_empresa_id,
      'Cristian Gonzalez',
      NULL,
      NULL,
      'cristian gonzalez'
    ),
    (
      v_empresa_id,
      'Cristian Miranda',
      '0981255403',
      NULL,
      'cristian miranda'
    ),
    (
      v_empresa_id,
      'Cristian Parreira',
      '0972792520',
      NULL,
      'cristian parreira'
    ),
    (
      v_empresa_id,
      'Cristian Rodriguez',
      '0987185851',
      NULL,
      'cristian rodriguez'
    ),
    (
      v_empresa_id,
      'Cristina Alvarenga',
      '0981297877',
      '20mil',
      'cristina alvarenga'
    ),
    (
      v_empresa_id,
      'Cristina Arrua',
      '0983431129',
      '30mil',
      'cristina arrua'
    ),
    (
      v_empresa_id,
      'Cristina Coronel',
      '0994659359',
      '30mil',
      'cristina coronel'
    ),
    (
      v_empresa_id,
      'Cristina Franco',
      '0981135880',
      NULL,
      'cristina franco'
    ),
    (
      v_empresa_id,
      'Cristina Galeano',
      '0994123413',
      NULL,
      'cristina galeano'
    ),
    (
      v_empresa_id,
      'Cristina Jara',
      '0986281242',
      NULL,
      'cristina jara'
    ),
    (
      v_empresa_id,
      'Cristina Reyes',
      '0972720005',
      NULL,
      'cristina reyes'
    ),
    (
      v_empresa_id,
      'Cristina Valiz',
      '0974256229',
      NULL,
      'cristina valiz'
    ),
    (
      v_empresa_id,
      'Cristofher Flor',
      '0971886935',
      NULL,
      'cristofher flor'
    ),
    (
      v_empresa_id,
      'Crithian Denis',
      '0994942767',
      NULL,
      'crithian denis'
    ),
    (
      v_empresa_id,
      'Crsthian Villaket',
      '0983548609',
      NULL,
      'crsthian villaket'
    ),
    (
      v_empresa_id,
      'Crystel Kehler',
      '0971422221',
      NULL,
      'crystel kehler'
    ),
    (
      v_empresa_id,
      'Cyndi Aranda',
      '0971141148',
      NULL,
      'cyndi aranda'
    ),
    (
      v_empresa_id,
      'Cynthia Caballero',
      '0982120826',
      NULL,
      'cynthia caballero'
    ),
    (
      v_empresa_id,
      'Cynthia Cantero',
      '0972123630',
      '1 selo (2)',
      'cynthia cantero'
    ),
    (
      v_empresa_id,
      'Cynthia Conigliaro',
      '0994768954',
      NULL,
      'cynthia conigliaro'
    ),
    (
      v_empresa_id,
      'Cynthia Figari',
      '0971388166',
      '1 selo (1)',
      'cynthia figari'
    ),
    (
      v_empresa_id,
      'Cynthia Gimenez',
      '0981415538',
      NULL,
      'cynthia gimenez'
    ),
    (
      v_empresa_id,
      'Cynthia Lopez',
      '0981215905',
      NULL,
      'cynthia lopez'
    ),
    (
      v_empresa_id,
      'Cynthia Ortiz',
      '0981909478',
      NULL,
      'cynthia ortiz'
    ),
    (
      v_empresa_id,
      'Cynthia Rojas',
      '0994346158',
      '20MIL',
      'cynthia rojas'
    ),
    (
      v_empresa_id,
      'Cynthia Vera',
      '0981436275',
      NULL,
      'cynthia vera'
    ),
    (
      v_empresa_id,
      'Cynthia Villalba',
      '0982324077',
      NULL,
      'cynthia villalba'
    ),
    (
      v_empresa_id,
      'Cyntia Barrios',
      '0982210010',
      NULL,
      'cyntia barrios'
    ),
    (
      v_empresa_id,
      'Dahiana Acosta',
      '0993383320',
      NULL,
      'dahiana acosta'
    ),
    (
      v_empresa_id,
      'Dahiana Aguero',
      '0975868369',
      NULL,
      'dahiana aguero'
    ),
    (
      v_empresa_id,
      'Dahiana Arrua',
      '0991785321',
      NULL,
      'dahiana arrua'
    ),
    (
      v_empresa_id,
      'Dahiana Avalos',
      '0984274487',
      NULL,
      'dahiana avalos'
    ),
    (
      v_empresa_id,
      'Dahiana Ayala',
      '0992314316',
      NULL,
      'dahiana ayala'
    ),
    (
      v_empresa_id,
      'Dahiana Britez',
      '0982875533',
      NULL,
      'dahiana britez'
    ),
    (
      v_empresa_id,
      'Dahiana Cardozo',
      '0991884090',
      NULL,
      'dahiana cardozo'
    ),
    (
      v_empresa_id,
      'Dahiana Colman',
      '0994340473',
      NULL,
      'dahiana colman'
    ),
    (
      v_empresa_id,
      'Dahiana Coronel',
      '0981634892',
      NULL,
      'dahiana coronel'
    ),
    (
      v_empresa_id,
      'Dahiana Duarte',
      '0972409868',
      NULL,
      'dahiana duarte'
    ),
    (
      v_empresa_id,
      'Dahiana Farina',
      '0971685070',
      NULL,
      'dahiana farina'
    ),
    (
      v_empresa_id,
      'Dahiana Franco',
      '0981534104',
      NULL,
      'dahiana franco'
    ),
    (
      v_empresa_id,
      'Dahiana Hevert',
      '0986184900',
      NULL,
      'dahiana hevert'
    ),
    (
      v_empresa_id,
      'Dahiana Hevrt',
      '0986184900',
      NULL,
      'dahiana hevrt'
    ),
    (
      v_empresa_id,
      'Dahiana Martinez',
      '0986933185',
      NULL,
      'dahiana martinez'
    ),
    (
      v_empresa_id,
      'Dahiana Melgarejo',
      '0984834834',
      NULL,
      'dahiana melgarejo'
    ),
    (
      v_empresa_id,
      'Dahiana Moreno',
      '0985308408',
      NULL,
      'dahiana moreno'
    ),
    (
      v_empresa_id,
      'Dahiana Orue',
      '0972538535',
      NULL,
      'dahiana orue'
    ),
    (
      v_empresa_id,
      'Dahiana Pesoa',
      '0981197317',
      NULL,
      'dahiana pesoa'
    ),
    (
      v_empresa_id,
      'Dahiana Prieto',
      '0984756928',
      NULL,
      'dahiana prieto'
    ),
    (
      v_empresa_id,
      'Dahiana Rivarola',
      '0982355472',
      NULL,
      'dahiana rivarola'
    ),
    (
      v_empresa_id,
      'Dahiana Silva',
      '0986746486',
      NULL,
      'dahiana silva'
    ),
    (
      v_empresa_id,
      'Dahiane Gooivur',
      '0992288525',
      NULL,
      'dahiane gooivur'
    ),
    (
      v_empresa_id,
      'Dahiyana Martinez',
      '0983504917',
      NULL,
      'dahiyana martinez'
    ),
    (
      v_empresa_id,
      'Daiana Robledo',
      '0981420588',
      NULL,
      'daiana robledo'
    ),
    (
      v_empresa_id,
      'Daiana Rodriguez',
      '0975665995',
      '30mil',
      'daiana rodriguez'
    ),
    (
      v_empresa_id,
      'Daihana Aguirre',
      '0983893216',
      NULL,
      'daihana aguirre'
    ),
    (
      v_empresa_id,
      'Daissi Wenninger',
      '0986650550',
      '1 selo (1)',
      'daissi wenninger'
    ),
    (
      v_empresa_id,
      'Daisy Arguello',
      '0994973724',
      NULL,
      'daisy arguello'
    ),
    (
      v_empresa_id,
      'Daisy Baez',
      '0982885647',
      NULL,
      'daisy baez'
    ),
    (
      v_empresa_id,
      'Daisy Benitez',
      '0984341632',
      NULL,
      'daisy benitez'
    ),
    (
      v_empresa_id,
      'Daisy Britos',
      '0985801296',
      NULL,
      'daisy britos'
    ),
    (
      v_empresa_id,
      'Daisy Dominguez',
      '0983852714',
      NULL,
      'daisy dominguez'
    ),
    (
      v_empresa_id,
      'Daisy Duerkcen',
      '0983586265',
      NULL,
      'daisy duerkcen'
    ),
    (
      v_empresa_id,
      'Daisy Fernandez',
      '0985482485',
      NULL,
      'daisy fernandez'
    ),
    (
      v_empresa_id,
      'Daisy Gabriela Comejo',
      '0983590846',
      NULL,
      'daisy gabriela comejo'
    ),
    (
      v_empresa_id,
      'Daisy Godoy',
      '0971886040',
      NULL,
      'daisy godoy'
    ),
    (
      v_empresa_id,
      'Daisy Imas',
      '0986650550',
      NULL,
      'daisy imas'
    ),
    (
      v_empresa_id,
      'Daisy Irala',
      '0981212150',
      NULL,
      'daisy irala'
    ),
    (
      v_empresa_id,
      'Daisy Leisamay',
      '0971531927',
      '20mil',
      'daisy leisamay'
    ),
    (
      v_empresa_id,
      'Daisy Martinez',
      '0971323385',
      NULL,
      'daisy martinez'
    ),
    (
      v_empresa_id,
      'Daisy Mendoza',
      '0971687927',
      NULL,
      'daisy mendoza'
    ),
    (
      v_empresa_id,
      'Daisy Molinas',
      '0986745125',
      NULL,
      'daisy molinas'
    ),
    (
      v_empresa_id,
      'Daisy Peralta',
      '0972468065',
      NULL,
      'daisy peralta'
    ),
    (
      v_empresa_id,
      'DAISY Riveros',
      '0975730440',
      NULL,
      'daisy riveros'
    ),
    (
      v_empresa_id,
      'Daisy Rodas',
      '0981343260',
      NULL,
      'daisy rodas'
    ),
    (
      v_empresa_id,
      'Daisy Romero',
      '0981389829',
      NULL,
      'daisy romero'
    ),
    (
      v_empresa_id,
      'Daisy Toledo',
      '0972769393',
      NULL,
      'daisy toledo'
    ),
    (
      v_empresa_id,
      'Daisy Vega',
      '0974131762',
      NULL,
      'daisy vega'
    ),
    (
      v_empresa_id,
      'Dalama Martinez',
      '0991469161',
      NULL,
      'dalama martinez'
    ),
    (
      v_empresa_id,
      'Dalba Sosa',
      '0982877541',
      NULL,
      'dalba sosa'
    ),
    (
      v_empresa_id,
      'Dalia Vera',
      '0982856466',
      NULL,
      'dalia vera'
    ),
    (
      v_empresa_id,
      'Dalila Ramirez',
      '0975399624',
      NULL,
      'dalila ramirez'
    ),
    (
      v_empresa_id,
      'Dallys Echeverria',
      '0982317400',
      NULL,
      'dallys echeverria'
    ),
    (
      v_empresa_id,
      'Dalma',
      NULL,
      NULL,
      'dalma'
    ),
    (
      v_empresa_id,
      'Dalma Godoy',
      '0981704421',
      '10mil',
      'dalma godoy'
    ),
    (
      v_empresa_id,
      'Dalma Nerea Torres',
      '0992628231',
      NULL,
      'dalma nerea torres'
    ),
    (
      v_empresa_id,
      'Damagini Gini',
      '0984292706',
      NULL,
      'damagini gini'
    ),
    (
      v_empresa_id,
      'Damara Peralta',
      '0971157714',
      NULL,
      'damara peralta'
    ),
    (
      v_empresa_id,
      'Damaris Baez',
      '0982235129',
      '10MIL',
      'damaris baez'
    ),
    (
      v_empresa_id,
      'Damaris Cristaldi',
      '0971229063',
      NULL,
      'damaris cristaldi'
    ),
    (
      v_empresa_id,
      'Damaris Delgado',
      '0981634880',
      NULL,
      'damaris delgado'
    ),
    (
      v_empresa_id,
      'Damaris Duarte',
      '0984241412',
      NULL,
      'damaris duarte'
    ),
    (
      v_empresa_id,
      'Damaris Palacios',
      '0982152455',
      NULL,
      'damaris palacios'
    ),
    (
      v_empresa_id,
      'Damaris Veron',
      '0985509805',
      NULL,
      'damaris veron'
    ),
    (
      v_empresa_id,
      'Damian Barrios',
      '0994129226',
      NULL,
      'damian barrios'
    ),
    (
      v_empresa_id,
      'Dana Benitez',
      '0986651140',
      NULL,
      'dana benitez'
    ),
    (
      v_empresa_id,
      'Dana Florentin',
      '0986840446',
      NULL,
      'dana florentin'
    ),
    (
      v_empresa_id,
      'Dana Garcete',
      '0982694151',
      NULL,
      'dana garcete'
    ),
    (
      v_empresa_id,
      'Dana Riveros',
      '0972878563',
      '20mil',
      'dana riveros'
    ),
    (
      v_empresa_id,
      'Dana Vera',
      '0971291622',
      NULL,
      'dana vera'
    ),
    (
      v_empresa_id,
      'Dania Arevalo',
      '0985818501',
      NULL,
      'dania arevalo'
    ),
    (
      v_empresa_id,
      'Dania Cuevas',
      '0995696852',
      NULL,
      'dania cuevas'
    ),
    (
      v_empresa_id,
      'Daniel Bogado',
      '0971925647',
      NULL,
      'daniel bogado'
    ),
    (
      v_empresa_id,
      'Daniel Tellez',
      '0985251418',
      NULL,
      'daniel tellez'
    ),
    (
      v_empresa_id,
      'Daniel Vera',
      '0987104791',
      NULL,
      'daniel vera'
    ),
    (
      v_empresa_id,
      'Daniela Bloch',
      '0981675266',
      NULL,
      'daniela bloch'
    ),
    (
      v_empresa_id,
      'Daniela Bordom',
      '0991664553',
      NULL,
      'daniela bordom'
    ),
    (
      v_empresa_id,
      'Daniela Cespedes',
      '0972939031',
      NULL,
      'daniela cespedes'
    ),
    (
      v_empresa_id,
      'Daniela Diaz',
      '0991386129',
      NULL,
      'daniela diaz'
    ),
    (
      v_empresa_id,
      'Daniela Grime',
      '0983030311',
      NULL,
      'daniela grime'
    ),
    (
      v_empresa_id,
      'Daniela Larrosa',
      '9861685996',
      NULL,
      'daniela larrosa'
    ),
    (
      v_empresa_id,
      'Daniela Wytthenbach',
      '0981856852',
      NULL,
      'daniela wytthenbach'
    ),
    (
      v_empresa_id,
      'Danis Hecheberrias',
      '0982317400',
      NULL,
      'danis hecheberrias'
    ),
    (
      v_empresa_id,
      'Danna Saldivar',
      '0982422787',
      NULL,
      'danna saldivar'
    ),
    (
      v_empresa_id,
      'Dany Diaz',
      '0985537695',
      NULL,
      'dany diaz'
    ),
    (
      v_empresa_id,
      'Dany Ferreir a',
      '0971729081',
      NULL,
      'dany ferreir a'
    ),
    (
      v_empresa_id,
      'Dany Ferreira',
      '0981729081',
      NULL,
      'dany ferreira'
    ),
    (
      v_empresa_id,
      'Dara Alvarez',
      '0983572036',
      NULL,
      'dara alvarez'
    ),
    (
      v_empresa_id,
      'Dara Britez',
      '0992777471',
      NULL,
      'dara britez'
    ),
    (
      v_empresa_id,
      'Darian Melgarejo',
      '0971338026',
      NULL,
      'darian melgarejo'
    ),
    (
      v_empresa_id,
      'Dariana Bianconi',
      '0981316505',
      NULL,
      'dariana bianconi'
    ),
    (
      v_empresa_id,
      'Dario Barrios',
      '0994986389',
      NULL,
      'dario barrios'
    ),
    (
      v_empresa_id,
      'Dario Cantero',
      '0991932070',
      NULL,
      'dario cantero'
    ),
    (
      v_empresa_id,
      'Dario Orrego',
      '0983988985',
      NULL,
      'dario orrego'
    ),
    (
      v_empresa_id,
      'David Britez',
      '0995660300',
      NULL,
      'david britez'
    ),
    (
      v_empresa_id,
      'david zarate',
      '0983496992',
      NULL,
      'david zarate'
    ),
    (
      v_empresa_id,
      'Davud Zarate',
      '0983496992',
      NULL,
      'davud zarate'
    ),
    (
      v_empresa_id,
      'Dayana Aranda',
      '0994100843',
      NULL,
      'dayana aranda'
    ),
    (
      v_empresa_id,
      'Dayana Barreto',
      '0971276714',
      NULL,
      'dayana barreto'
    ),
    (
      v_empresa_id,
      'Dayana Benitez',
      '0991233153',
      '10MIL',
      'dayana benitez'
    ),
    (
      v_empresa_id,
      'Daysi Chaparro',
      '0992216271',
      NULL,
      'daysi chaparro'
    ),
    (
      v_empresa_id,
      'Daysi Fernandez',
      '0985482485',
      NULL,
      'daysi fernandez'
    ),
    (
      v_empresa_id,
      'Daysi Gamarra',
      '0984104253',
      NULL,
      'daysi gamarra'
    ),
    (
      v_empresa_id,
      'Daysi Godoy',
      '871886040',
      '1 selo (5)',
      'daysi godoy'
    ),
    (
      v_empresa_id,
      'Daysi Iman',
      '0986650550',
      NULL,
      'daysi iman'
    ),
    (
      v_empresa_id,
      'Daysi Medina',
      '0981055777',
      NULL,
      'daysi medina'
    ),
    (
      v_empresa_id,
      'Daysi Sayas',
      '0984485777',
      NULL,
      'daysi sayas'
    ),
    (
      v_empresa_id,
      'Daysi Sotto',
      '0982509509',
      NULL,
      'daysi sotto'
    ),
    (
      v_empresa_id,
      'Daysi Vega',
      '0974131762',
      NULL,
      'daysi vega'
    ),
    (
      v_empresa_id,
      'Dbdiel Ortiz',
      '0984870488',
      NULL,
      'dbdiel ortiz'
    ),
    (
      v_empresa_id,
      'De lilio a las palmeras',
      NULL,
      NULL,
      'de lilio a las palmeras'
    ),
    (
      v_empresa_id,
      'De Lillo para palmeras',
      NULL,
      NULL,
      'de lillo para palmeras'
    ),
    (
      v_empresa_id,
      'Debora Cordovez',
      '0984814052',
      NULL,
      'debora cordovez'
    ),
    (
      v_empresa_id,
      'Debora Paredes',
      '0987216263',
      NULL,
      'debora paredes'
    ),
    (
      v_empresa_id,
      'Debora Sanchez',
      '0981878281',
      NULL,
      'debora sanchez'
    ),
    (
      v_empresa_id,
      'Deidy Ramirez',
      '0981749948',
      NULL,
      'deidy ramirez'
    ),
    (
      v_empresa_id,
      'Deisy Chacarro',
      '0982227704',
      NULL,
      'deisy chacarro'
    ),
    (
      v_empresa_id,
      'Deisy Galeano',
      '0992973504',
      NULL,
      'deisy galeano'
    ),
    (
      v_empresa_id,
      'Deisy Gamarra',
      '0984104253',
      NULL,
      'deisy gamarra'
    ),
    (
      v_empresa_id,
      'Deisy Gonzalez',
      '0976151560',
      NULL,
      'deisy gonzalez'
    ),
    (
      v_empresa_id,
      'Deisy Ortiz',
      '0982926375',
      NULL,
      'deisy ortiz'
    ),
    (
      v_empresa_id,
      'Deisy Rojas',
      '0983449860',
      NULL,
      'deisy rojas'
    ),
    (
      v_empresa_id,
      'Deisy Romero',
      '0982686864',
      NULL,
      'deisy romero'
    ),
    (
      v_empresa_id,
      'Deivi Bernal',
      '0981426316',
      NULL,
      'deivi bernal'
    ),
    (
      v_empresa_id,
      'Delci Lezcano',
      '0994755585',
      NULL,
      'delci lezcano'
    ),
    (
      v_empresa_id,
      'Delci Martinez',
      '0982412189',
      NULL,
      'delci martinez'
    ),
    (
      v_empresa_id,
      'Delcy Arruba',
      '0981162331',
      NULL,
      'delcy arruba'
    ),
    (
      v_empresa_id,
      'Delia Gimenez',
      '0971174829',
      NULL,
      'delia gimenez'
    ),
    (
      v_empresa_id,
      'Delia Morales',
      '0991750100',
      '10mil',
      'delia morales'
    ),
    (
      v_empresa_id,
      'Delia Ortiz',
      '0984172575',
      NULL,
      'delia ortiz'
    ),
    (
      v_empresa_id,
      'Delsi',
      '0982961537',
      '10 mil',
      'delsi'
    ),
    (
      v_empresa_id,
      'Delsi Rios',
      '0982961537',
      '10 mil',
      'delsi rios'
    ),
    (
      v_empresa_id,
      'Denise Aguirre',
      '0985277115',
      NULL,
      'denise aguirre'
    ),
    (
      v_empresa_id,
      'Denise Cano',
      '0994490140',
      NULL,
      'denise cano'
    ),
    (
      v_empresa_id,
      'Denise Diaz',
      '0972391747',
      NULL,
      'denise diaz'
    ),
    (
      v_empresa_id,
      'Denise Martinez',
      '0986619236',
      NULL,
      'denise martinez'
    ),
    (
      v_empresa_id,
      'Denisse Doria',
      '0986387455',
      '60MIL',
      'denisse doria'
    ),
    (
      v_empresa_id,
      'Denisse Gaona',
      '0971135364',
      NULL,
      'denisse gaona'
    ),
    (
      v_empresa_id,
      'Deoina Quintana',
      '0971777780',
      NULL,
      'deoina quintana'
    ),
    (
      v_empresa_id,
      'Deolinda martinez',
      '0981801905',
      NULL,
      'deolinda martinez'
    ),
    (
      v_empresa_id,
      'Deolinda Quintana',
      '0971777780',
      NULL,
      'deolinda quintana'
    ),
    (
      v_empresa_id,
      'Derlis',
      NULL,
      NULL,
      'derlis'
    ),
    (
      v_empresa_id,
      'Derlis Baez',
      '0986536838',
      '30MIL',
      'derlis baez'
    ),
    (
      v_empresa_id,
      'Derlis Gimenez',
      '0961913176',
      NULL,
      'derlis gimenez'
    ),
    (
      v_empresa_id,
      'Derlis Mongelos',
      '0986164247',
      '10mil',
      'derlis mongelos'
    ),
    (
      v_empresa_id,
      'Desire Ayala',
      '0983362071',
      NULL,
      'desire ayala'
    ),
    (
      v_empresa_id,
      'Devani Rojas',
      '0982190324',
      NULL,
      'devani rojas'
    ),
    (
      v_empresa_id,
      'Devany Rojas',
      '0982190324',
      NULL,
      'devany rojas'
    ),
    (
      v_empresa_id,
      'Devora Vallejos',
      '0982800748',
      NULL,
      'devora vallejos'
    ),
    (
      v_empresa_id,
      'Deysi Gamarra',
      '0985998468',
      NULL,
      'deysi gamarra'
    ),
    (
      v_empresa_id,
      'Deysi Romero',
      '0981389829',
      NULL,
      'deysi romero'
    ),
    (
      v_empresa_id,
      'Deysi Sosa',
      '0982570342',
      NULL,
      'deysi sosa'
    ),
    (
      v_empresa_id,
      'Deysiy Ortellado',
      '0971813777',
      NULL,
      'deysiy ortellado'
    ),
    (
      v_empresa_id,
      'Diana Aguayo',
      '0981325983',
      '20mil',
      'diana aguayo'
    ),
    (
      v_empresa_id,
      'Diana Aguero',
      '0992463748',
      '1 selo (1)',
      'diana aguero'
    ),
    (
      v_empresa_id,
      'Diana Amarilla',
      '0991671885',
      NULL,
      'diana amarilla'
    ),
    (
      v_empresa_id,
      'Diana Arzamienda',
      '0985127159',
      NULL,
      'diana arzamienda'
    ),
    (
      v_empresa_id,
      'Diana Aveiro',
      '0984417498',
      NULL,
      'diana aveiro'
    ),
    (
      v_empresa_id,
      'Diana Avila',
      '0971563060',
      NULL,
      'diana avila'
    ),
    (
      v_empresa_id,
      'Diana Avvila',
      '0971563060',
      NULL,
      'diana avvila'
    ),
    (
      v_empresa_id,
      'Diana Ayala',
      '0981831372',
      NULL,
      'diana ayala'
    ),
    (
      v_empresa_id,
      'Diana Barreto',
      '0972254531',
      NULL,
      'diana barreto'
    ),
    (
      v_empresa_id,
      'Diana Barrios',
      '0971352305',
      NULL,
      'diana barrios'
    ),
    (
      v_empresa_id,
      'Diana Benitez',
      '0981362750',
      '10mil',
      'diana benitez'
    ),
    (
      v_empresa_id,
      'Diana Bogarin',
      '0982204782',
      NULL,
      'diana bogarin'
    ),
    (
      v_empresa_id,
      'Diana Bruler',
      NULL,
      NULL,
      'diana bruler'
    ),
    (
      v_empresa_id,
      'Diana Buhler',
      '0974401649',
      NULL,
      'diana buhler'
    ),
    (
      v_empresa_id,
      'Diana Caballero',
      '0974156189',
      NULL,
      'diana caballero'
    ),
    (
      v_empresa_id,
      'Diana Caceres',
      '0992205726',
      NULL,
      'diana caceres'
    ),
    (
      v_empresa_id,
      'Diana Caloma',
      '0971347083',
      '10MIL',
      'diana caloma'
    ),
    (
      v_empresa_id,
      'Diana Cariboni',
      '0981655542',
      NULL,
      'diana cariboni'
    ),
    (
      v_empresa_id,
      'Diana Carreras',
      '0984285380',
      NULL,
      'diana carreras'
    ),
    (
      v_empresa_id,
      'Diana Colman',
      '0976555590',
      '10MIL',
      'diana colman'
    ),
    (
      v_empresa_id,
      'Diana Coronel',
      '0984820664',
      NULL,
      'diana coronel'
    ),
    (
      v_empresa_id,
      'Diana Cristaldo',
      '0981563097',
      NULL,
      'diana cristaldo'
    ),
    (
      v_empresa_id,
      'Diana Diaz',
      '0981886358',
      NULL,
      'diana diaz'
    ),
    (
      v_empresa_id,
      'Diana Driedger',
      '0972432670',
      NULL,
      'diana driedger'
    ),
    (
      v_empresa_id,
      'Diana Espinosa',
      '0971979499',
      NULL,
      'diana espinosa'
    ),
    (
      v_empresa_id,
      'Diana Gonzalez',
      '0971918956',
      NULL,
      'diana gonzalez'
    ),
    (
      v_empresa_id,
      'Diana greco',
      '0982400129',
      NULL,
      'diana greco'
    ),
    (
      v_empresa_id,
      'Diana Herrera',
      '0981880990',
      NULL,
      'diana herrera'
    ),
    (
      v_empresa_id,
      'Diana Limprich',
      '0982547511',
      NULL,
      'diana limprich'
    ),
    (
      v_empresa_id,
      'Diana Machuca',
      '0982542339',
      '1 selo (1)',
      'diana machuca'
    ),
    (
      v_empresa_id,
      'Diana Mareco',
      '0981224158',
      NULL,
      'diana mareco'
    ),
    (
      v_empresa_id,
      'Diana Marimom',
      '0981273728',
      '1 selo (1)',
      'diana marimom'
    ),
    (
      v_empresa_id,
      'Diana Martinez',
      '0994154517',
      '10mil',
      'diana martinez'
    ),
    (
      v_empresa_id,
      'Diana Medina',
      '0983641116',
      '20mil',
      'diana medina'
    ),
    (
      v_empresa_id,
      'Diana Melgarejo',
      '0992971637',
      NULL,
      'diana melgarejo'
    ),
    (
      v_empresa_id,
      'Diana Mereles',
      '0971159314',
      NULL,
      'diana mereles'
    ),
    (
      v_empresa_id,
      'Diana Mesa',
      '0981574526',
      NULL,
      'diana mesa'
    ),
    (
      v_empresa_id,
      'Diana Meza',
      '0981574526',
      NULL,
      'diana meza'
    ),
    (
      v_empresa_id,
      'Diana Moquelos',
      '0985945880',
      NULL,
      'diana moquelos'
    ),
    (
      v_empresa_id,
      'Diana Morro',
      '0962294557',
      NULL,
      'diana morro'
    ),
    (
      v_empresa_id,
      'Diana Ocampos',
      '0984284883',
      NULL,
      'diana ocampos'
    ),
    (
      v_empresa_id,
      'Diana Paniagua',
      '0981536396',
      NULL,
      'diana paniagua'
    ),
    (
      v_empresa_id,
      'Diana Perez',
      '0992377515',
      '10mil',
      'diana perez'
    ),
    (
      v_empresa_id,
      'Diana Riquelme',
      '0991557686',
      NULL,
      'diana riquelme'
    ),
    (
      v_empresa_id,
      'Diana Rojas',
      '0972106509',
      NULL,
      'diana rojas'
    ),
    (
      v_empresa_id,
      'Diana Rolon',
      '0981261539',
      NULL,
      'diana rolon'
    ),
    (
      v_empresa_id,
      'Diana Salinas',
      '0981748100',
      '10MIL',
      'diana salinas'
    ),
    (
      v_empresa_id,
      'Diana Sequeira',
      '0986399988',
      '10MIL',
      'diana sequeira'
    ),
    (
      v_empresa_id,
      'Diana Sotelo',
      '0984158695',
      NULL,
      'diana sotelo'
    ),
    (
      v_empresa_id,
      'Diana Trevisson',
      '0985541053',
      NULL,
      'diana trevisson'
    ),
    (
      v_empresa_id,
      'Diana Vaaldez',
      '0981733881',
      NULL,
      'diana vaaldez'
    ),
    (
      v_empresa_id,
      'Diana Valdovinos',
      '0992924306',
      '20mil',
      'diana valdovinos'
    ),
    (
      v_empresa_id,
      'Diana Zotelo',
      '0984158695',
      NULL,
      'diana zotelo'
    ),
    (
      v_empresa_id,
      'Diandra Romero',
      '9875946030',
      NULL,
      'diandra romero'
    ),
    (
      v_empresa_id,
      'Diane Lopez',
      '0981654044',
      NULL,
      'diane lopez'
    ),
    (
      v_empresa_id,
      'Dickie Bengen',
      NULL,
      NULL,
      'dickie bengen'
    ),
    (
      v_empresa_id,
      'Diego Colman',
      '0984259322',
      '20mil',
      'diego colman'
    ),
    (
      v_empresa_id,
      'Diego ferreira',
      '0971527878',
      NULL,
      'diego ferreira'
    ),
    (
      v_empresa_id,
      'Diego Fleitas',
      '0976760989',
      NULL,
      'diego fleitas'
    ),
    (
      v_empresa_id,
      'Diego Leguizamon',
      '0987486828',
      '20mil',
      'diego leguizamon'
    ),
    (
      v_empresa_id,
      'Diego Mancuello',
      '0992920106',
      NULL,
      'diego mancuello'
    ),
    (
      v_empresa_id,
      'Diego Mechetti',
      '0994884407',
      '30mil',
      'diego mechetti'
    ),
    (
      v_empresa_id,
      'Diego Montalbeti',
      '0986426195',
      NULL,
      'diego montalbeti'
    ),
    (
      v_empresa_id,
      'Diego Paredes',
      '0981981593',
      '10mil',
      'diego paredes'
    ),
    (
      v_empresa_id,
      'Diego Sanchez',
      '0991238511',
      NULL,
      'diego sanchez'
    ),
    (
      v_empresa_id,
      'Diego Segovia',
      '0981271763',
      '1 selo (1)',
      'diego segovia'
    ),
    (
      v_empresa_id,
      'Diego Silva',
      '0992246941',
      NULL,
      'diego silva'
    ),
    (
      v_empresa_id,
      'Diego Velazquez',
      '0973444729',
      '20mil',
      'diego velazquez'
    ),
    (
      v_empresa_id,
      'Digna Adorno',
      '0981955700',
      NULL,
      'digna adorno'
    ),
    (
      v_empresa_id,
      'Dilce Rodriguez',
      '0994159689',
      NULL,
      'dilce rodriguez'
    ),
    (
      v_empresa_id,
      'Dina Mora',
      '0981630118',
      NULL,
      'dina mora'
    ),
    (
      v_empresa_id,
      'Dionisia Gonzalez',
      NULL,
      NULL,
      'dionisia gonzalez'
    ),
    (
      v_empresa_id,
      'Diva Gonzalez',
      '0981305783',
      NULL,
      'diva gonzalez'
    ),
    (
      v_empresa_id,
      'Diwa gonzalez',
      '0981305783',
      NULL,
      'diwa gonzalez'
    ),
    (
      v_empresa_id,
      'Do Hoe Kim',
      '0991294918',
      NULL,
      'do hoe kim'
    ),
    (
      v_empresa_id,
      'Docia Monges',
      '0987210004',
      NULL,
      'docia monges'
    ),
    (
      v_empresa_id,
      'Dora Baez',
      '0971206513',
      NULL,
      'dora baez'
    ),
    (
      v_empresa_id,
      'Dora Cabrera',
      '0972177036',
      NULL,
      'dora cabrera'
    ),
    (
      v_empresa_id,
      'Dora Figueredo',
      NULL,
      NULL,
      'dora figueredo'
    ),
    (
      v_empresa_id,
      'Dora Gonzalez',
      '0982448643',
      NULL,
      'dora gonzalez'
    ),
    (
      v_empresa_id,
      'Dora Lacarrubba',
      '0976900088',
      '20MIL',
      'dora lacarrubba'
    ),
    (
      v_empresa_id,
      'Dora Meaurio',
      '0985707978',
      NULL,
      'dora meaurio'
    ),
    (
      v_empresa_id,
      'Dora Vera',
      '0972975870',
      NULL,
      'dora vera'
    ),
    (
      v_empresa_id,
      'Doris Riquelme',
      '0983246516',
      NULL,
      'doris riquelme'
    ),
    (
      v_empresa_id,
      'Doris Rojas',
      '0971218386',
      NULL,
      'doris rojas'
    ),
    (
      v_empresa_id,
      'Doris Sinabri',
      '0981805726',
      NULL,
      'doris sinabri'
    ),
    (
      v_empresa_id,
      'Dorys Garcete',
      '0982143469',
      NULL,
      'dorys garcete'
    ),
    (
      v_empresa_id,
      'Dorys rojas',
      '0971218386',
      NULL,
      'dorys rojas'
    ),
    (
      v_empresa_id,
      'Dulce Cabrera',
      '0985960691',
      NULL,
      'dulce cabrera'
    ),
    (
      v_empresa_id,
      'Dulce Pacher',
      '0992060342',
      '30MIL',
      'dulce pacher'
    ),
    (
      v_empresa_id,
      'Dulce Piris Da Motta',
      '0981747827',
      '10MIL',
      'dulce piris da motta'
    ),
    (
      v_empresa_id,
      'Dulce Velazquez',
      '0991492912',
      NULL,
      'dulce velazquez'
    ),
    (
      v_empresa_id,
      'Dyanne Lopez',
      '0981654044',
      '1 selo (1)',
      'dyanne lopez'
    ),
    (
      v_empresa_id,
      'Eder Cubas',
      '0991759920',
      NULL,
      'eder cubas'
    ),
    (
      v_empresa_id,
      'Edgar Cabrera',
      '0983284636',
      NULL,
      'edgar cabrera'
    ),
    (
      v_empresa_id,
      'edgar Piris',
      '0981813300',
      NULL,
      'edgar piris'
    ),
    (
      v_empresa_id,
      'Edgar Ramirez',
      '0981102925',
      '30MIL',
      'edgar ramirez'
    ),
    (
      v_empresa_id,
      'Edgar Tescheira',
      '0991209729',
      NULL,
      'edgar tescheira'
    ),
    (
      v_empresa_id,
      'Edilene Torrente',
      '0991455661',
      '1 selo (1)',
      'edilene torrente'
    ),
    (
      v_empresa_id,
      'Edit Centurion',
      '0982886941',
      NULL,
      'edit centurion'
    ),
    (
      v_empresa_id,
      'Edita Fiore',
      '0991704190',
      NULL,
      'edita fiore'
    ),
    (
      v_empresa_id,
      'Edita Fiorre',
      '0991704190',
      NULL,
      'edita fiorre'
    ),
    (
      v_empresa_id,
      'Edita Gomez',
      '0983479655',
      NULL,
      'edita gomez'
    ),
    (
      v_empresa_id,
      'Edith Nunez',
      '0982984254',
      NULL,
      'edith nunez'
    ),
    (
      v_empresa_id,
      'Edith Rodas',
      '0984667884',
      NULL,
      'edith rodas'
    ),
    (
      v_empresa_id,
      'Edith Rojas',
      '0983036691',
      NULL,
      'edith rojas'
    ),
    (
      v_empresa_id,
      'Eduardo Caceres',
      '0983519890',
      NULL,
      'eduardo caceres'
    ),
    (
      v_empresa_id,
      'Eduardo Duarte',
      '0985537758',
      '20mil',
      'eduardo duarte'
    ),
    (
      v_empresa_id,
      'Eduardo Florentin',
      '0981840910',
      NULL,
      'eduardo florentin'
    ),
    (
      v_empresa_id,
      'Eduardo Mongelos',
      '0981299750',
      '1 selo (1)',
      'eduardo mongelos'
    ),
    (
      v_empresa_id,
      'Eduardo Vallejos',
      '0985415446',
      NULL,
      'eduardo vallejos'
    ),
    (
      v_empresa_id,
      'Eduardo Zarza',
      '0971671400',
      NULL,
      'eduardo zarza'
    ),
    (
      v_empresa_id,
      'Eduvifijis Rodriguez',
      '0981953287',
      NULL,
      'eduvifijis rodriguez'
    ),
    (
      v_empresa_id,
      'Egreso ingreso Fiscalia',
      NULL,
      NULL,
      'egreso ingreso fiscalia'
    ),
    (
      v_empresa_id,
      'Egreso para Lillo',
      NULL,
      NULL,
      'egreso para lillo'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 4: filas 1501..2000
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'egresos',
      NULL,
      NULL,
      'egresos'
    ),
    (
      v_empresa_id,
      'Egresos de lilio',
      NULL,
      NULL,
      'egresos de lilio'
    ),
    (
      v_empresa_id,
      'Elbira Gonzalez',
      '0981364914',
      NULL,
      'elbira gonzalez'
    ),
    (
      v_empresa_id,
      'Eleida Santos',
      '0971537585',
      '10mil',
      'eleida santos'
    ),
    (
      v_empresa_id,
      'Elen Benitez',
      '0983930658',
      NULL,
      'elen benitez'
    ),
    (
      v_empresa_id,
      'Elen Ibanez',
      '0971280052',
      NULL,
      'elen ibanez'
    ),
    (
      v_empresa_id,
      'Elena Alcaraz',
      '0971684005',
      NULL,
      'elena alcaraz'
    ),
    (
      v_empresa_id,
      'Elena Benitez',
      '0994735010',
      NULL,
      'elena benitez'
    ),
    (
      v_empresa_id,
      'Elena Escobar',
      '0981818096',
      '50mil',
      'elena escobar'
    ),
    (
      v_empresa_id,
      'Elena Espinola',
      '0971408943',
      NULL,
      'elena espinola'
    ),
    (
      v_empresa_id,
      'Elena Fernandez',
      '0992213609',
      NULL,
      'elena fernandez'
    ),
    (
      v_empresa_id,
      'Elena Godoy',
      '0994221802',
      '10mil',
      'elena godoy'
    ),
    (
      v_empresa_id,
      'Elena Hamarilla',
      '0981382127',
      NULL,
      'elena hamarilla'
    ),
    (
      v_empresa_id,
      'Elena Helena',
      '0971401661',
      '60mil',
      'elena helena'
    ),
    (
      v_empresa_id,
      'Elena Mendez',
      '0983444752',
      NULL,
      'elena mendez'
    ),
    (
      v_empresa_id,
      'Elena NUNEZ',
      '0981180734',
      NULL,
      'elena nunez'
    ),
    (
      v_empresa_id,
      'Elena Ocampos',
      '0984691707',
      NULL,
      'elena ocampos'
    ),
    (
      v_empresa_id,
      'Elena Villalba',
      '0984776657',
      NULL,
      'elena villalba'
    ),
    (
      v_empresa_id,
      'Elena Watanabe',
      '0961628900',
      NULL,
      'elena watanabe'
    ),
    (
      v_empresa_id,
      'Elenir Egevarth',
      '0984269314',
      NULL,
      'elenir egevarth'
    ),
    (
      v_empresa_id,
      'Elenisse Ramires',
      '0981425045',
      NULL,
      'elenisse ramires'
    ),
    (
      v_empresa_id,
      'Eli Cantero',
      '0984766279',
      NULL,
      'eli cantero'
    ),
    (
      v_empresa_id,
      'Eli Chavez',
      '0981948870',
      NULL,
      'eli chavez'
    ),
    (
      v_empresa_id,
      'Eli Melgarejo',
      '0984948486',
      NULL,
      'eli melgarejo'
    ),
    (
      v_empresa_id,
      'Eliana Acosta',
      '0981218004',
      NULL,
      'eliana acosta'
    ),
    (
      v_empresa_id,
      'Eliana Anciaus',
      '0983500081',
      NULL,
      'eliana anciaus'
    ),
    (
      v_empresa_id,
      'Eliana Bogado',
      '0981767272',
      '1 selo (1)',
      'eliana bogado'
    ),
    (
      v_empresa_id,
      'Eliana Centurion',
      '0981938471',
      NULL,
      'eliana centurion'
    ),
    (
      v_empresa_id,
      'Eliana Dominguez',
      '0982614756',
      NULL,
      'eliana dominguez'
    ),
    (
      v_empresa_id,
      'Eliana Duarte',
      '0983368593',
      NULL,
      'eliana duarte'
    ),
    (
      v_empresa_id,
      'Eliana Guefos',
      '0971570584',
      NULL,
      'eliana guefos'
    ),
    (
      v_empresa_id,
      'Eliana Malgarejo',
      '0992976636',
      '30mil',
      'eliana malgarejo'
    ),
    (
      v_empresa_id,
      'Eliana Martinez',
      '0972545822',
      NULL,
      'eliana martinez'
    ),
    (
      v_empresa_id,
      'Eliana Orue',
      '0986426584',
      NULL,
      'eliana orue'
    ),
    (
      v_empresa_id,
      'Eliana Ozorio',
      '0985338672',
      NULL,
      'eliana ozorio'
    ),
    (
      v_empresa_id,
      'Eliana Ruiz Diaz',
      '0975137775',
      NULL,
      'eliana ruiz diaz'
    ),
    (
      v_empresa_id,
      'Eliana Sanabria',
      '0971631600',
      NULL,
      'eliana sanabria'
    ),
    (
      v_empresa_id,
      'Eliana Toedero',
      '0981479327',
      NULL,
      'eliana toedero'
    ),
    (
      v_empresa_id,
      'Eliandro De Souza',
      '0986250046',
      NULL,
      'eliandro de souza'
    ),
    (
      v_empresa_id,
      'Eliandro De Suza',
      '0986250046',
      NULL,
      'eliandro de suza'
    ),
    (
      v_empresa_id,
      'Eliane',
      NULL,
      NULL,
      'eliane'
    ),
    (
      v_empresa_id,
      'Eliane Cors',
      '0971331118',
      NULL,
      'eliane cors'
    ),
    (
      v_empresa_id,
      'Eliane Linaes',
      '0981179183',
      NULL,
      'eliane linaes'
    ),
    (
      v_empresa_id,
      'eliane sords',
      '0971331118',
      NULL,
      'eliane sords'
    ),
    (
      v_empresa_id,
      'Elianne Delgado',
      '0982588175',
      NULL,
      'elianne delgado'
    ),
    (
      v_empresa_id,
      'Elianne Linares',
      '0981179183',
      NULL,
      'elianne linares'
    ),
    (
      v_empresa_id,
      'Elias Godoy',
      '0961970306',
      NULL,
      'elias godoy'
    ),
    (
      v_empresa_id,
      'Elida Chavez',
      '0982617314',
      NULL,
      'elida chavez'
    ),
    (
      v_empresa_id,
      'Elida Segovia',
      '0994957161',
      NULL,
      'elida segovia'
    ),
    (
      v_empresa_id,
      'Elin Fortner',
      '0971133007',
      NULL,
      'elin fortner'
    ),
    (
      v_empresa_id,
      'Elio Grazia',
      '0981808812',
      '10mil',
      'elio grazia'
    ),
    (
      v_empresa_id,
      'Elisa',
      '0983767110',
      NULL,
      'elisa'
    ),
    (
      v_empresa_id,
      'Elisa gonzalez',
      '0981740479',
      NULL,
      'elisa gonzalez'
    ),
    (
      v_empresa_id,
      'Elisa Riveros',
      '0993545901',
      NULL,
      'elisa riveros'
    ),
    (
      v_empresa_id,
      'Elisa viveros',
      '0981426230',
      NULL,
      'elisa viveros'
    ),
    (
      v_empresa_id,
      'Elisandra Ojeda',
      '0976143651',
      NULL,
      'elisandra ojeda'
    ),
    (
      v_empresa_id,
      'Eliseo Cristaldo',
      '0981857552',
      NULL,
      'eliseo cristaldo'
    ),
    (
      v_empresa_id,
      'Eliza Gonzalez',
      '0981740479',
      NULL,
      'eliza gonzalez'
    ),
    (
      v_empresa_id,
      'Eliza Rojas',
      '0971700886',
      NULL,
      'eliza rojas'
    ),
    (
      v_empresa_id,
      'Eliza Rubinstey',
      '0983767110',
      NULL,
      'eliza rubinstey'
    ),
    (
      v_empresa_id,
      'Elizabet Britez',
      '0972129082',
      NULL,
      'elizabet britez'
    ),
    (
      v_empresa_id,
      'Elizabet Cardozo',
      '0991968121',
      '10MIL',
      'elizabet cardozo'
    ),
    (
      v_empresa_id,
      'Elizabet Fretes',
      '0991992209',
      NULL,
      'elizabet fretes'
    ),
    (
      v_empresa_id,
      'Elizabet Melgarejo',
      '0984948486',
      NULL,
      'elizabet melgarejo'
    ),
    (
      v_empresa_id,
      'Elizabet Reiner',
      '0981497487',
      NULL,
      'elizabet reiner'
    ),
    (
      v_empresa_id,
      'Elizabet Ruiz Diaz',
      '0983734280',
      NULL,
      'elizabet ruiz diaz'
    ),
    (
      v_empresa_id,
      'Elizabet Vallejos',
      '0983651937',
      NULL,
      'elizabet vallejos'
    ),
    (
      v_empresa_id,
      'Elizabete cardoso',
      '0991968121',
      '10 mil',
      'elizabete cardoso'
    ),
    (
      v_empresa_id,
      'Elizabeth Benitez',
      '0971928551',
      NULL,
      'elizabeth benitez'
    ),
    (
      v_empresa_id,
      'Elizabeth Chavez',
      '0987394127',
      NULL,
      'elizabeth chavez'
    ),
    (
      v_empresa_id,
      'Elizabeth Corvalan',
      '0991692723',
      NULL,
      'elizabeth corvalan'
    ),
    (
      v_empresa_id,
      'Elizabeth Cristaldo',
      '0961881341',
      NULL,
      'elizabeth cristaldo'
    ),
    (
      v_empresa_id,
      'Elizabeth Medina',
      '0982037530',
      NULL,
      'elizabeth medina'
    ),
    (
      v_empresa_id,
      'Elizabeth Ruiz',
      '0983734280',
      NULL,
      'elizabeth ruiz'
    ),
    (
      v_empresa_id,
      'Elizabeth Vargara',
      '0991534977',
      NULL,
      'elizabeth vargara'
    ),
    (
      v_empresa_id,
      'Elizabeth Villalba',
      '0973523696',
      NULL,
      'elizabeth villalba'
    ),
    (
      v_empresa_id,
      'Elizabeth Zaracho',
      '0981292398',
      NULL,
      'elizabeth zaracho'
    ),
    (
      v_empresa_id,
      'Elizabthe Cardozo',
      '0991968721',
      NULL,
      'elizabthe cardozo'
    ),
    (
      v_empresa_id,
      'Elke Paetkau',
      '0971423257',
      '1 selo (3)',
      'elke paetkau'
    ),
    (
      v_empresa_id,
      'Ella Robledo',
      '0994441800',
      NULL,
      'ella robledo'
    ),
    (
      v_empresa_id,
      'Ella Romero',
      '0994441800',
      NULL,
      'ella romero'
    ),
    (
      v_empresa_id,
      'Elliali Caceres',
      '0974145577',
      NULL,
      'elliali caceres'
    ),
    (
      v_empresa_id,
      'Elma Enns',
      '0972506017',
      NULL,
      'elma enns'
    ),
    (
      v_empresa_id,
      'Elma Masi',
      '0991204806',
      NULL,
      'elma masi'
    ),
    (
      v_empresa_id,
      'Eloisa Alarcon',
      '0981425102',
      NULL,
      'eloisa alarcon'
    ),
    (
      v_empresa_id,
      'Eloria Cristalda',
      '0992287541',
      NULL,
      'eloria cristalda'
    ),
    (
      v_empresa_id,
      'Elsa Pittoni',
      '0971195979',
      NULL,
      'elsa pittoni'
    ),
    (
      v_empresa_id,
      'Elsa Zaracho',
      '0982157214',
      '30mil',
      'elsa zaracho'
    ),
    (
      v_empresa_id,
      'Elva Ruiz',
      '0986712080',
      NULL,
      'elva ruiz'
    ),
    (
      v_empresa_id,
      'Elva Segovia',
      '0981490880',
      NULL,
      'elva segovia'
    ),
    (
      v_empresa_id,
      'Elva Vicioso',
      '0981982138',
      NULL,
      'elva vicioso'
    ),
    (
      v_empresa_id,
      'Elvia Benitez',
      '0992281226',
      '30mil',
      'elvia benitez'
    ),
    (
      v_empresa_id,
      'Elvio Zarate',
      '0991535988',
      NULL,
      'elvio zarate'
    ),
    (
      v_empresa_id,
      'Elvira Benitez',
      '0981444749',
      NULL,
      'elvira benitez'
    ),
    (
      v_empresa_id,
      'Elvira Gonzalez',
      '0981364114',
      '10mil',
      'elvira gonzalez'
    ),
    (
      v_empresa_id,
      'Elvira Leguizamon',
      '0981744382',
      NULL,
      'elvira leguizamon'
    ),
    (
      v_empresa_id,
      'Elvira Sugasti',
      '0982521237',
      NULL,
      'elvira sugasti'
    ),
    (
      v_empresa_id,
      'Ema Gonzalez',
      '0983976316',
      NULL,
      'ema gonzalez'
    ),
    (
      v_empresa_id,
      'Emilce Aquino',
      '0982634415',
      NULL,
      'emilce aquino'
    ),
    (
      v_empresa_id,
      'Emilce Candia',
      '0985370070',
      NULL,
      'emilce candia'
    ),
    (
      v_empresa_id,
      'Emilce Garcia',
      '0982890045',
      NULL,
      'emilce garcia'
    ),
    (
      v_empresa_id,
      'Emilce Sanchez',
      '0971533511',
      '1 selo (1)',
      'emilce sanchez'
    ),
    (
      v_empresa_id,
      'Emilce Tatiana Curunaga',
      '0983882558',
      NULL,
      'emilce tatiana curunaga'
    ),
    (
      v_empresa_id,
      'Emile Maidana',
      '0985370070',
      NULL,
      'emile maidana'
    ),
    (
      v_empresa_id,
      'Emili Aguilar',
      '0991892833',
      NULL,
      'emili aguilar'
    ),
    (
      v_empresa_id,
      'Emilia Ferreira',
      '0982192828',
      NULL,
      'emilia ferreira'
    ),
    (
      v_empresa_id,
      'Emilia Gimenez',
      '0974412890',
      '20MIL',
      'emilia gimenez'
    ),
    (
      v_empresa_id,
      'Emilia Rodriguez',
      '0981522482',
      NULL,
      'emilia rodriguez'
    ),
    (
      v_empresa_id,
      'Emilia Rojas',
      '0982606030',
      NULL,
      'emilia rojas'
    ),
    (
      v_empresa_id,
      'Emilia villasboa',
      '0982477928',
      NULL,
      'emilia villasboa'
    ),
    (
      v_empresa_id,
      'Emilio Ramon',
      '0972683009',
      NULL,
      'emilio ramon'
    ),
    (
      v_empresa_id,
      'Emilse Sanchez',
      '0971533551',
      NULL,
      'emilse sanchez'
    ),
    (
      v_empresa_id,
      'Emily Aguilar',
      '0991892833',
      NULL,
      'emily aguilar'
    ),
    (
      v_empresa_id,
      'Emily Santander',
      '0981851010',
      NULL,
      'emily santander'
    ),
    (
      v_empresa_id,
      'Enrique Arce',
      NULL,
      NULL,
      'enrique arce'
    ),
    (
      v_empresa_id,
      'Enrique De Domeco',
      '0992351094',
      NULL,
      'enrique de domeco'
    ),
    (
      v_empresa_id,
      'Enrique Florentin',
      '0981419835',
      NULL,
      'enrique florentin'
    ),
    (
      v_empresa_id,
      'Enrique Gonzalez',
      '0971762388',
      '30MIL',
      'enrique gonzalez'
    ),
    (
      v_empresa_id,
      'Enzo Gabo',
      '0971716608',
      '10mil',
      'enzo gabo'
    ),
    (
      v_empresa_id,
      'Enzo Romero',
      NULL,
      NULL,
      'enzo romero'
    ),
    (
      v_empresa_id,
      'ercedes Armas',
      '0991857359',
      NULL,
      'ercedes armas'
    ),
    (
      v_empresa_id,
      'Eriadna Hernandez',
      '0976126120',
      NULL,
      'eriadna hernandez'
    ),
    (
      v_empresa_id,
      'Eriatna Hernandez',
      '0976126120',
      NULL,
      'eriatna hernandez'
    ),
    (
      v_empresa_id,
      'Erica Guerreros',
      '92351940',
      NULL,
      'erica guerreros'
    ),
    (
      v_empresa_id,
      'Erica Soria',
      '0972626776',
      NULL,
      'erica soria'
    ),
    (
      v_empresa_id,
      'Erika Arrua',
      '0981183833',
      NULL,
      'erika arrua'
    ),
    (
      v_empresa_id,
      'Erika Arza',
      '0992314112',
      NULL,
      'erika arza'
    ),
    (
      v_empresa_id,
      'Erika Bareiro',
      '0975235395',
      NULL,
      'erika bareiro'
    ),
    (
      v_empresa_id,
      'Erika Coronel',
      '0971119112',
      NULL,
      'erika coronel'
    ),
    (
      v_empresa_id,
      'Erika Duarte',
      '0971468371',
      NULL,
      'erika duarte'
    ),
    (
      v_empresa_id,
      'Erika Espinoza',
      '0971248198',
      NULL,
      'erika espinoza'
    ),
    (
      v_empresa_id,
      'Erika Estigarribia',
      '0992688184',
      NULL,
      'erika estigarribia'
    ),
    (
      v_empresa_id,
      'Erika Frutos',
      '0986545558',
      '10mil',
      'erika frutos'
    ),
    (
      v_empresa_id,
      'Erika Gomez',
      '0985219203',
      NULL,
      'erika gomez'
    ),
    (
      v_empresa_id,
      'Erika Gonzalez',
      '0972458132',
      '1 selo (1)',
      'erika gonzalez'
    ),
    (
      v_empresa_id,
      'Erika Guerreros',
      '0992351940',
      NULL,
      'erika guerreros'
    ),
    (
      v_empresa_id,
      'Erika Lugo',
      '0981875840',
      NULL,
      'erika lugo'
    ),
    (
      v_empresa_id,
      'Erika Maria Gonzalez',
      '0981963556',
      '1 selo (1)',
      'erika maria gonzalez'
    ),
    (
      v_empresa_id,
      'Erika Martinez',
      '0986683282',
      NULL,
      'erika martinez'
    ),
    (
      v_empresa_id,
      'Erika Rolon',
      '0986907010',
      NULL,
      'erika rolon'
    ),
    (
      v_empresa_id,
      'Erika Romero',
      '0971309920',
      '10MIL',
      'erika romero'
    ),
    (
      v_empresa_id,
      'Erika Ruiz Dias',
      '0982569852',
      NULL,
      'erika ruiz dias'
    ),
    (
      v_empresa_id,
      'Erika Soria',
      '0972626776',
      NULL,
      'erika soria'
    ),
    (
      v_empresa_id,
      'Ernan Gimenez',
      '0985155432',
      NULL,
      'ernan gimenez'
    ),
    (
      v_empresa_id,
      'Ernesto Ocampos',
      '0992274154',
      NULL,
      'ernesto ocampos'
    ),
    (
      v_empresa_id,
      'Erodrigo Alvarez',
      '0971742408',
      NULL,
      'erodrigo alvarez'
    ),
    (
      v_empresa_id,
      'Esdgar Britez',
      '0976585943',
      NULL,
      'esdgar britez'
    ),
    (
      v_empresa_id,
      'Esmeralda Lopez Gonzalez',
      '0984614433',
      NULL,
      'esmeralda lopez gonzalez'
    ),
    (
      v_empresa_id,
      'Esmilce Alonzo',
      NULL,
      NULL,
      'esmilce alonzo'
    ),
    (
      v_empresa_id,
      'Esmilce Galeano',
      '0984526301',
      NULL,
      'esmilce galeano'
    ),
    (
      v_empresa_id,
      'Esteban Antunes',
      '0972633787',
      NULL,
      'esteban antunes'
    ),
    (
      v_empresa_id,
      'Esteban Caballero',
      '0971943406',
      NULL,
      'esteban caballero'
    ),
    (
      v_empresa_id,
      'Estefani Cardozo',
      '0973129312',
      '20MIL',
      'estefani cardozo'
    ),
    (
      v_empresa_id,
      'Estefani Gamarra',
      '0993542434',
      NULL,
      'estefani gamarra'
    ),
    (
      v_empresa_id,
      'Estefani Pati;a',
      '0994680500',
      '30mil',
      'estefani pati;a'
    ),
    (
      v_empresa_id,
      'Estefani Rodriguez',
      '0985423590',
      NULL,
      'estefani rodriguez'
    ),
    (
      v_empresa_id,
      'Estefania Basualdo',
      '0981287061',
      NULL,
      'estefania basualdo'
    ),
    (
      v_empresa_id,
      'Estefania Benitez',
      '0985698359',
      NULL,
      'estefania benitez'
    ),
    (
      v_empresa_id,
      'Estefania Cristaldo',
      '0987121263',
      '30mil',
      'estefania cristaldo'
    ),
    (
      v_empresa_id,
      'Estefania Gimenez',
      '0994914024',
      NULL,
      'estefania gimenez'
    ),
    (
      v_empresa_id,
      'Estefania Machado',
      '0984437573',
      NULL,
      'estefania machado'
    ),
    (
      v_empresa_id,
      'Estefania Santaniela',
      '0982740323',
      '10MIL',
      'estefania santaniela'
    ),
    (
      v_empresa_id,
      'Estela Arvez',
      '0981100630',
      NULL,
      'estela arvez'
    ),
    (
      v_empresa_id,
      'Estela Cespedes',
      '0981844859',
      NULL,
      'estela cespedes'
    ),
    (
      v_empresa_id,
      'Estela Coronel',
      '0972663427',
      NULL,
      'estela coronel'
    ),
    (
      v_empresa_id,
      'Estela Enns',
      '0974413429',
      NULL,
      'estela enns'
    ),
    (
      v_empresa_id,
      'Estela Frutos',
      '0982982397',
      NULL,
      'estela frutos'
    ),
    (
      v_empresa_id,
      'Estela Kwoun',
      '0981245735',
      NULL,
      'estela kwoun'
    ),
    (
      v_empresa_id,
      'Estela Santacruz',
      '0981564687',
      NULL,
      'estela santacruz'
    ),
    (
      v_empresa_id,
      'Estella Sarate',
      '0971336078',
      '30mil',
      'estella sarate'
    ),
    (
      v_empresa_id,
      'Ester Diaz',
      '0991612060',
      NULL,
      'ester diaz'
    ),
    (
      v_empresa_id,
      'Ester Fretes',
      '0994211807',
      NULL,
      'ester fretes'
    ),
    (
      v_empresa_id,
      'Ester Gilebran',
      '0971888202',
      NULL,
      'ester gilebran'
    ),
    (
      v_empresa_id,
      'Ester Kinn',
      '0975858888',
      NULL,
      'ester kinn'
    ),
    (
      v_empresa_id,
      'Ester Ramirez',
      '0986205400',
      '10mil',
      'ester ramirez'
    ),
    (
      v_empresa_id,
      'Esther De Vooght',
      '0983392192',
      '10mil',
      'esther de vooght'
    ),
    (
      v_empresa_id,
      'Esther Koube',
      '0961610160',
      NULL,
      'esther koube'
    ),
    (
      v_empresa_id,
      'Estiven Baez',
      '0981107789',
      '10mil',
      'estiven baez'
    ),
    (
      v_empresa_id,
      'Estrella Tudela',
      '0982115754',
      '30mil',
      'estrella tudela'
    ),
    (
      v_empresa_id,
      'Ethan Mendes',
      '0984121420',
      NULL,
      'ethan mendes'
    ),
    (
      v_empresa_id,
      'Eugenio Vera',
      '0986208556',
      NULL,
      'eugenio vera'
    ),
    (
      v_empresa_id,
      'Eulices Martinez',
      '0984870913',
      '30mil',
      'eulices martinez'
    ),
    (
      v_empresa_id,
      'Eunice Cardozo',
      '0983107710',
      NULL,
      'eunice cardozo'
    ),
    (
      v_empresa_id,
      'Eunise Rodriguez',
      '0972519834',
      '50mil',
      'eunise rodriguez'
    ),
    (
      v_empresa_id,
      'Eva Bazzano',
      '0994395898',
      NULL,
      'eva bazzano'
    ),
    (
      v_empresa_id,
      'Eva Chaparro',
      '0985195091',
      NULL,
      'eva chaparro'
    ),
    (
      v_empresa_id,
      'Eva Figueredo',
      '0971937185',
      '30mil',
      'eva figueredo'
    ),
    (
      v_empresa_id,
      'Eva Garcete',
      '0984373617',
      NULL,
      'eva garcete'
    ),
    (
      v_empresa_id,
      'Eva Ortiz',
      '0972185945',
      '30mil',
      'eva ortiz'
    ),
    (
      v_empresa_id,
      'Eva Penal',
      '0981427064',
      NULL,
      'eva penal'
    ),
    (
      v_empresa_id,
      'Eva Penayo',
      '0981100277',
      NULL,
      'eva penayo'
    ),
    (
      v_empresa_id,
      'Eva Velar',
      '0993312281',
      NULL,
      'eva velar'
    ),
    (
      v_empresa_id,
      'Evanhy Lovera',
      '0982014250',
      '10mil',
      'evanhy lovera'
    ),
    (
      v_empresa_id,
      'Evani Lopez',
      '0982014250',
      NULL,
      'evani lopez'
    ),
    (
      v_empresa_id,
      'Evani Lovera',
      '0982014250',
      NULL,
      'evani lovera'
    ),
    (
      v_empresa_id,
      'Evekyn Da Silva',
      '0991806061',
      NULL,
      'evekyn da silva'
    ),
    (
      v_empresa_id,
      'Evelia Fernandez',
      '0981305434',
      NULL,
      'evelia fernandez'
    ),
    (
      v_empresa_id,
      'Evelin Benitez',
      '0992349823',
      '20mil',
      'evelin benitez'
    ),
    (
      v_empresa_id,
      'Evelin Colman',
      '0994358604',
      NULL,
      'evelin colman'
    ),
    (
      v_empresa_id,
      'Evelin Gimenez',
      '0986319025',
      NULL,
      'evelin gimenez'
    ),
    (
      v_empresa_id,
      'Evelin Ibarrola',
      NULL,
      NULL,
      'evelin ibarrola'
    ),
    (
      v_empresa_id,
      'Evelin Silva',
      '0971210491',
      NULL,
      'evelin silva'
    ),
    (
      v_empresa_id,
      'Evelio Salinas',
      '0981190789',
      NULL,
      'evelio salinas'
    ),
    (
      v_empresa_id,
      'Evelyn',
      '0994451590',
      NULL,
      'evelyn'
    ),
    (
      v_empresa_id,
      'Evelyn Alcaraz',
      '0992243087',
      NULL,
      'evelyn alcaraz'
    ),
    (
      v_empresa_id,
      'Evelyn Alvarez',
      '0986710215',
      '30mil+10mil',
      'evelyn alvarez'
    ),
    (
      v_empresa_id,
      'Evelyn Alverez',
      '0986710215',
      NULL,
      'evelyn alverez'
    ),
    (
      v_empresa_id,
      'Evelyn Barberan',
      '0981970169',
      NULL,
      'evelyn barberan'
    ),
    (
      v_empresa_id,
      'Evelyn Barrios',
      '0973654779',
      NULL,
      'evelyn barrios'
    ),
    (
      v_empresa_id,
      'Evelyn Benitez',
      '0972762111',
      '10mil',
      'evelyn benitez'
    ),
    (
      v_empresa_id,
      'Evelyn Bonilla',
      '0971228104',
      NULL,
      'evelyn bonilla'
    ),
    (
      v_empresa_id,
      'Evelyn Caceres',
      '0992226599',
      NULL,
      'evelyn caceres'
    ),
    (
      v_empresa_id,
      'Evelyn Cargan',
      '0993333358',
      NULL,
      'evelyn cargan'
    ),
    (
      v_empresa_id,
      'Evelyn Castineira',
      '0994451590',
      '10MIL',
      'evelyn castineira'
    ),
    (
      v_empresa_id,
      'Evelyn Franco',
      '0984806413',
      NULL,
      'evelyn franco'
    ),
    (
      v_empresa_id,
      'Evelyn Gimenez',
      '0986319025',
      NULL,
      'evelyn gimenez'
    ),
    (
      v_empresa_id,
      'Evelyn Gonzalez',
      '0981982551',
      NULL,
      'evelyn gonzalez'
    ),
    (
      v_empresa_id,
      'Evelyn Lopez',
      '0976979891',
      NULL,
      'evelyn lopez'
    ),
    (
      v_empresa_id,
      'Evelyn Mendieta',
      '0986319025',
      NULL,
      'evelyn mendieta'
    ),
    (
      v_empresa_id,
      'Evelyn Nunez',
      '0984880849',
      NULL,
      'evelyn nunez'
    ),
    (
      v_empresa_id,
      'Evelyn Palacio',
      '0991401170',
      '1 selo (3)',
      'evelyn palacio'
    ),
    (
      v_empresa_id,
      'Evelyn Pedrozo',
      '0993582729',
      NULL,
      'evelyn pedrozo'
    ),
    (
      v_empresa_id,
      'Evelyn Ramirez',
      '0991386411',
      NULL,
      'evelyn ramirez'
    ),
    (
      v_empresa_id,
      'Evelyn Rojas',
      '0971335986',
      NULL,
      'evelyn rojas'
    ),
    (
      v_empresa_id,
      'Evelyn Santa Cruz',
      '0994532111',
      NULL,
      'evelyn santa cruz'
    ),
    (
      v_empresa_id,
      'Evelyn Silva',
      '0971210491',
      NULL,
      'evelyn silva'
    ),
    (
      v_empresa_id,
      'Evelyn Vera',
      '0985587878',
      NULL,
      'evelyn vera'
    ),
    (
      v_empresa_id,
      'Evelyn Veron',
      '0971436555',
      NULL,
      'evelyn veron'
    ),
    (
      v_empresa_id,
      'Everson Frutos',
      '0972943006',
      NULL,
      'everson frutos'
    ),
    (
      v_empresa_id,
      'Ezequiel Minella',
      '0983962567',
      NULL,
      'ezequiel minella'
    ),
    (
      v_empresa_id,
      'Ezequiel Rodriguez',
      '0971311996',
      NULL,
      'ezequiel rodriguez'
    ),
    (
      v_empresa_id,
      'Fa',
      NULL,
      NULL,
      'fa'
    ),
    (
      v_empresa_id,
      'Fabi',
      NULL,
      '20mil',
      'fabi'
    ),
    (
      v_empresa_id,
      'Fabian Cristaldo',
      '0991381611',
      NULL,
      'fabian cristaldo'
    ),
    (
      v_empresa_id,
      'Fabian Pereyra',
      '0981255448',
      NULL,
      'fabian pereyra'
    ),
    (
      v_empresa_id,
      'Fabiana Aguilar',
      '0986272602',
      NULL,
      'fabiana aguilar'
    ),
    (
      v_empresa_id,
      'Fabiana Almada',
      '0984800357',
      NULL,
      'fabiana almada'
    ),
    (
      v_empresa_id,
      'Fabiana Aluan',
      '0981592711',
      NULL,
      'fabiana aluan'
    ),
    (
      v_empresa_id,
      'Fabiana Barrios',
      '0971663268',
      NULL,
      'fabiana barrios'
    ),
    (
      v_empresa_id,
      'Fabiana Benitez',
      '0971797837',
      '30mil/Bolsa',
      'fabiana benitez'
    ),
    (
      v_empresa_id,
      'Fabiana Celana',
      '0971474101',
      '10MIL',
      'fabiana celana'
    ),
    (
      v_empresa_id,
      'Fabiana Guzman',
      '0986540441',
      NULL,
      'fabiana guzman'
    ),
    (
      v_empresa_id,
      'Fabiana Maciel',
      '0981225577',
      NULL,
      'fabiana maciel'
    ),
    (
      v_empresa_id,
      'Fabiana Uran',
      '0981243001',
      NULL,
      'fabiana uran'
    ),
    (
      v_empresa_id,
      'Fabiani Rivias',
      '0993496606',
      NULL,
      'fabiani rivias'
    ),
    (
      v_empresa_id,
      'Fabiola Alcorta',
      '0971914985',
      NULL,
      'fabiola alcorta'
    ),
    (
      v_empresa_id,
      'Fabiola Alvarez',
      '0974285931',
      NULL,
      'fabiola alvarez'
    ),
    (
      v_empresa_id,
      'Fabiola Amaya',
      '0981993503',
      '1 selo (1)',
      'fabiola amaya'
    ),
    (
      v_empresa_id,
      'Fabiola Benitez',
      '0984150237',
      NULL,
      'fabiola benitez'
    ),
    (
      v_empresa_id,
      'Fabiola bernar',
      '0991402535',
      NULL,
      'fabiola bernar'
    ),
    (
      v_empresa_id,
      'Fabiola Caniza',
      '0986361866',
      NULL,
      'fabiola caniza'
    ),
    (
      v_empresa_id,
      'Fabiola Dominguez',
      '0994742769',
      NULL,
      'fabiola dominguez'
    ),
    (
      v_empresa_id,
      'Fabiola Franco',
      '0993566525',
      NULL,
      'fabiola franco'
    ),
    (
      v_empresa_id,
      'Fabiola Garcia',
      '0982580999',
      NULL,
      'fabiola garcia'
    ),
    (
      v_empresa_id,
      'Fabiola Maciel',
      '0986582058',
      NULL,
      'fabiola maciel'
    ),
    (
      v_empresa_id,
      'Fabiola Marecos',
      '0993349732',
      NULL,
      'fabiola marecos'
    ),
    (
      v_empresa_id,
      'Fabiola Martinez',
      '0985769292',
      NULL,
      'fabiola martinez'
    ),
    (
      v_empresa_id,
      'Fabiola Melgarejo',
      '0983746455',
      NULL,
      'fabiola melgarejo'
    ),
    (
      v_empresa_id,
      'Fabiola Mendoza',
      '0981545712',
      NULL,
      'fabiola mendoza'
    ),
    (
      v_empresa_id,
      'Fabiola Mercado',
      '0982185081',
      '1 selo (10)',
      'fabiola mercado'
    ),
    (
      v_empresa_id,
      'Fabiola Ojeda',
      '0983305859',
      NULL,
      'fabiola ojeda'
    ),
    (
      v_empresa_id,
      'Fabiola Ortellado',
      '0971785425',
      NULL,
      'fabiola ortellado'
    ),
    (
      v_empresa_id,
      'Fabiola Peralta',
      '0983810357',
      NULL,
      'fabiola peralta'
    ),
    (
      v_empresa_id,
      'Fabiola ruiz diaz',
      '0985366998',
      '10mil',
      'fabiola ruiz diaz'
    ),
    (
      v_empresa_id,
      'Fabrizio Ontano',
      '0982286004',
      NULL,
      'fabrizio ontano'
    ),
    (
      v_empresa_id,
      'Fani Rojas',
      '0986673672',
      NULL,
      'fani rojas'
    ),
    (
      v_empresa_id,
      'Fanny Artamendia',
      '0991479705',
      '1 selo (1)',
      'fanny artamendia'
    ),
    (
      v_empresa_id,
      'fanny Baez',
      '0975194347',
      NULL,
      'fanny baez'
    ),
    (
      v_empresa_id,
      'Fanny Hosmann',
      '0991827137',
      NULL,
      'fanny hosmann'
    ),
    (
      v_empresa_id,
      'Fanny Noemi',
      '0986673672',
      NULL,
      'fanny noemi'
    ),
    (
      v_empresa_id,
      'Fanny Velazquez',
      '0981380537',
      NULL,
      'fanny velazquez'
    ),
    (
      v_empresa_id,
      'FannyHofmann',
      '0991827137',
      NULL,
      'fannyhofmann'
    ),
    (
      v_empresa_id,
      'Fany Martinez',
      NULL,
      NULL,
      'fany martinez'
    ),
    (
      v_empresa_id,
      'Farima Caceres',
      '0971169818',
      NULL,
      'farima caceres'
    ),
    (
      v_empresa_id,
      'Fashion Go',
      NULL,
      NULL,
      'fashion go'
    ),
    (
      v_empresa_id,
      'Fatima (fardo Segunda bolsa premium)',
      NULL,
      NULL,
      'fatima (fardo segunda bolsa premium)'
    ),
    (
      v_empresa_id,
      'Fatima (Fardo)',
      NULL,
      NULL,
      'fatima (fardo)'
    ),
    (
      v_empresa_id,
      'Fatima Angelino',
      '0972276209',
      NULL,
      'fatima angelino'
    ),
    (
      v_empresa_id,
      'Fatima Arce',
      '0984205037',
      NULL,
      'fatima arce'
    ),
    (
      v_empresa_id,
      'Fatima Arrua',
      '0982479691',
      NULL,
      'fatima arrua'
    ),
    (
      v_empresa_id,
      'Fatima Barreto',
      '98390481',
      NULL,
      'fatima barreto'
    ),
    (
      v_empresa_id,
      'Fatima Benegas',
      '0971698432',
      NULL,
      'fatima benegas'
    ),
    (
      v_empresa_id,
      'Fatima Benitez',
      '0991888599',
      NULL,
      'fatima benitez'
    ),
    (
      v_empresa_id,
      'Fatima Brizuela',
      '0981820422',
      NULL,
      'fatima brizuela'
    ),
    (
      v_empresa_id,
      'Fatima Caballero',
      '0991211446',
      NULL,
      'fatima caballero'
    ),
    (
      v_empresa_id,
      'Fatima Cano',
      '0971555368',
      NULL,
      'fatima cano'
    ),
    (
      v_empresa_id,
      'Fatima Centurion',
      '0987287717',
      NULL,
      'fatima centurion'
    ),
    (
      v_empresa_id,
      'Fatima Colman',
      '0981179723',
      '20mil',
      'fatima colman'
    ),
    (
      v_empresa_id,
      'Fatima Davalos',
      '0994484366',
      NULL,
      'fatima davalos'
    ),
    (
      v_empresa_id,
      'Fatima Delvalle',
      '0982830247',
      NULL,
      'fatima delvalle'
    ),
    (
      v_empresa_id,
      'Fatima Duarte',
      '0971809480',
      NULL,
      'fatima duarte'
    ),
    (
      v_empresa_id,
      'Fatima Enciso',
      '0983151946',
      NULL,
      'fatima enciso'
    ),
    (
      v_empresa_id,
      'Fatima Europa 1',
      NULL,
      NULL,
      'fatima europa 1'
    ),
    (
      v_empresa_id,
      'Fatima Figueredo',
      '0994200190',
      '30mil',
      'fatima figueredo'
    ),
    (
      v_empresa_id,
      'Fatima Franco',
      '0972285076',
      '1 selo (1)',
      'fatima franco'
    ),
    (
      v_empresa_id,
      'Fatima Gonzalez',
      '0986673570',
      NULL,
      'fatima gonzalez'
    ),
    (
      v_empresa_id,
      'Fatima Lopez',
      '0981481486',
      '10MIL',
      'fatima lopez'
    ),
    (
      v_empresa_id,
      'Fatima Lugo',
      '0994691736',
      '10mil',
      'fatima lugo'
    ),
    (
      v_empresa_id,
      'Fatima Malgarejo',
      '0983051486',
      NULL,
      'fatima malgarejo'
    ),
    (
      v_empresa_id,
      'Fatima Marti',
      '0994565863',
      NULL,
      'fatima marti'
    ),
    (
      v_empresa_id,
      'Fatima Martinez',
      '0981884689',
      NULL,
      'fatima martinez'
    ),
    (
      v_empresa_id,
      'Fatima Mendoza',
      '0981131599',
      NULL,
      'fatima mendoza'
    ),
    (
      v_empresa_id,
      'Fatima Moreno',
      '0982700665',
      NULL,
      'fatima moreno'
    ),
    (
      v_empresa_id,
      'Fatima Ojeda',
      '0982209891',
      NULL,
      'fatima ojeda'
    ),
    (
      v_empresa_id,
      'Fatima Ortega',
      '0972550511',
      NULL,
      'fatima ortega'
    ),
    (
      v_empresa_id,
      'Fatima Paez',
      '0981484440',
      '10mil',
      'fatima paez'
    ),
    (
      v_empresa_id,
      'Fatima Pazmor',
      '0971583109',
      NULL,
      'fatima pazmor'
    ),
    (
      v_empresa_id,
      'Fatima Peralta',
      '0982745088',
      NULL,
      'fatima peralta'
    ),
    (
      v_empresa_id,
      'Fatima Reyes',
      '0974759254',
      '10mil',
      'fatima reyes'
    ),
    (
      v_empresa_id,
      'Fatima Riveros',
      '0983601794',
      NULL,
      'fatima riveros'
    ),
    (
      v_empresa_id,
      'Fatima Salina',
      '0981828004',
      NULL,
      'fatima salina'
    ),
    (
      v_empresa_id,
      'Fatima Salinas',
      '0981828004',
      '10MIL',
      'fatima salinas'
    ),
    (
      v_empresa_id,
      'Fatima Torres',
      '0982583482',
      NULL,
      'fatima torres'
    ),
    (
      v_empresa_id,
      'Fatima Valdez',
      '0982410408',
      NULL,
      'fatima valdez'
    ),
    (
      v_empresa_id,
      'Fatima Vega',
      '0962194630',
      NULL,
      'fatima vega'
    ),
    (
      v_empresa_id,
      'Fatima Vera',
      '0984592077',
      NULL,
      'fatima vera'
    ),
    (
      v_empresa_id,
      'Fatima Yuruhan',
      '0982155112',
      NULL,
      'fatima yuruhan'
    ),
    (
      v_empresa_id,
      'Fatina Morel',
      '0991754331',
      NULL,
      'fatina morel'
    ),
    (
      v_empresa_id,
      'Federico Servian',
      '0974625108',
      NULL,
      'federico servian'
    ),
    (
      v_empresa_id,
      'Fedra Perez',
      '0995650916',
      NULL,
      'fedra perez'
    ),
    (
      v_empresa_id,
      'Felicia Rolon',
      '0971870699',
      NULL,
      'felicia rolon'
    ),
    (
      v_empresa_id,
      'Felix Areco',
      '0973575609',
      NULL,
      'felix areco'
    ),
    (
      v_empresa_id,
      'Felix Lugo',
      '0982797466',
      NULL,
      'felix lugo'
    ),
    (
      v_empresa_id,
      'Felix Recalde',
      '0972896487',
      NULL,
      'felix recalde'
    ),
    (
      v_empresa_id,
      'Feliz Veloso',
      '0981964008',
      NULL,
      'feliz veloso'
    ),
    (
      v_empresa_id,
      'Ferederihd Gayoso',
      '0991549044',
      NULL,
      'ferederihd gayoso'
    ),
    (
      v_empresa_id,
      'Fermina Jimenez',
      '0971857837',
      NULL,
      'fermina jimenez'
    ),
    (
      v_empresa_id,
      'Fernanda Aguilera',
      '0992491556',
      '20mil',
      'fernanda aguilera'
    ),
    (
      v_empresa_id,
      'Fernanda Caballero',
      '0981378895',
      '10mil',
      'fernanda caballero'
    ),
    (
      v_empresa_id,
      'Fernanda Calderon',
      '0984237853',
      NULL,
      'fernanda calderon'
    ),
    (
      v_empresa_id,
      'Fernanda Farina',
      '0986182109',
      '10mil',
      'fernanda farina'
    ),
    (
      v_empresa_id,
      'Fernanda Fernandez',
      '0986641791',
      NULL,
      'fernanda fernandez'
    ),
    (
      v_empresa_id,
      'Fernanda Noguera',
      '0982431020',
      '1 selo (1)',
      'fernanda noguera'
    ),
    (
      v_empresa_id,
      'Fernanda Portillo',
      '0986274424',
      NULL,
      'fernanda portillo'
    ),
    (
      v_empresa_id,
      'Fernanda Rodriguez',
      '0984259052',
      NULL,
      'fernanda rodriguez'
    ),
    (
      v_empresa_id,
      'Fernanda Unez',
      '0981977134',
      '20MIL',
      'fernanda unez'
    ),
    (
      v_empresa_id,
      'Fernando Brugada',
      '0981877645',
      NULL,
      'fernando brugada'
    ),
    (
      v_empresa_id,
      'Fernando Fernandez',
      '0981853985',
      NULL,
      'fernando fernandez'
    ),
    (
      v_empresa_id,
      'Fernando Jara',
      '0986532021',
      NULL,
      'fernando jara'
    ),
    (
      v_empresa_id,
      'Fernando Villagra',
      '0981349830',
      NULL,
      'fernando villagra'
    ),
    (
      v_empresa_id,
      'Feve Portillo',
      '0981221130',
      '1 selo (2)',
      'feve portillo'
    ),
    (
      v_empresa_id,
      'Fgabriela Narvaez',
      '0994276612',
      NULL,
      'fgabriela narvaez'
    ),
    (
      v_empresa_id,
      'Fidelina Diana',
      '0981204800',
      NULL,
      'fidelina diana'
    ),
    (
      v_empresa_id,
      'Filip Frank',
      NULL,
      NULL,
      'filip frank'
    ),
    (
      v_empresa_id,
      'Fio Martinez',
      '0992626493',
      NULL,
      'fio martinez'
    ),
    (
      v_empresa_id,
      'Fiona Ferreira',
      '0981283227',
      NULL,
      'fiona ferreira'
    ),
    (
      v_empresa_id,
      'Fiona Vanessa',
      '0985338463',
      NULL,
      'fiona vanessa'
    ),
    (
      v_empresa_id,
      'Fiona Zabala',
      '0991714005',
      NULL,
      'fiona zabala'
    ),
    (
      v_empresa_id,
      'Fiorela Diaz',
      '0981284731',
      NULL,
      'fiorela diaz'
    ),
    (
      v_empresa_id,
      'Fiorella Aguilar',
      '0994923146',
      NULL,
      'fiorella aguilar'
    ),
    (
      v_empresa_id,
      'Fiorella Araujo',
      '0984237263',
      '10mil',
      'fiorella araujo'
    ),
    (
      v_empresa_id,
      'Fiorella Barrezi',
      '0984119933',
      NULL,
      'fiorella barrezi'
    ),
    (
      v_empresa_id,
      'Fiorella Cabral',
      '0984284922',
      NULL,
      'fiorella cabral'
    ),
    (
      v_empresa_id,
      'Fiorella Caceres',
      '0984976647',
      NULL,
      'fiorella caceres'
    ),
    (
      v_empresa_id,
      'Fiorella Della loggia',
      '0983337245',
      '10MIL',
      'fiorella della loggia'
    ),
    (
      v_empresa_id,
      'Fiorella Delvalle',
      '0982830247',
      NULL,
      'fiorella delvalle'
    ),
    (
      v_empresa_id,
      'Fiorella Especial',
      '0983765451',
      NULL,
      'fiorella especial'
    ),
    (
      v_empresa_id,
      'Fiorella Especiale',
      '0983765451',
      NULL,
      'fiorella especiale'
    ),
    (
      v_empresa_id,
      'Fiorella Fernandez',
      '0981686290',
      NULL,
      'fiorella fernandez'
    ),
    (
      v_empresa_id,
      'Fiorella Ferreira',
      '0972711255',
      '10mil',
      'fiorella ferreira'
    ),
    (
      v_empresa_id,
      'Fiorella Flecha',
      '0994809919',
      NULL,
      'fiorella flecha'
    ),
    (
      v_empresa_id,
      'Fiorella Galeano',
      '0981515751',
      NULL,
      'fiorella galeano'
    ),
    (
      v_empresa_id,
      'Fiorella Garcete',
      '0972162161',
      '1 selo (1)',
      'fiorella garcete'
    ),
    (
      v_empresa_id,
      'Fiorella Garcia',
      '0972605708',
      NULL,
      'fiorella garcia'
    ),
    (
      v_empresa_id,
      'Fiorella Gonzalez',
      '0976608597',
      NULL,
      'fiorella gonzalez'
    ),
    (
      v_empresa_id,
      'Fiorella Larece',
      '0987178752',
      NULL,
      'fiorella larece'
    ),
    (
      v_empresa_id,
      'Fiorella Lescano',
      '0985292410',
      NULL,
      'fiorella lescano'
    ),
    (
      v_empresa_id,
      'Fiorella Lopez',
      '0985654129',
      NULL,
      'fiorella lopez'
    ),
    (
      v_empresa_id,
      'Fiorella Melgarejo',
      '0986527500',
      NULL,
      'fiorella melgarejo'
    ),
    (
      v_empresa_id,
      'Fiorella Mendoza',
      '0972286698',
      NULL,
      'fiorella mendoza'
    ),
    (
      v_empresa_id,
      'Fiorella Niella',
      '0981383611',
      '20MIL',
      'fiorella niella'
    ),
    (
      v_empresa_id,
      'Fiorella Pelliccetti',
      '0981307050',
      NULL,
      'fiorella pelliccetti'
    ),
    (
      v_empresa_id,
      'Fiorella Ramirez',
      '0982264311',
      NULL,
      'fiorella ramirez'
    ),
    (
      v_empresa_id,
      'Fiorella Recala',
      '0984811434',
      NULL,
      'fiorella recala'
    ),
    (
      v_empresa_id,
      'Fiorella Rejala',
      '0984811464',
      NULL,
      'fiorella rejala'
    ),
    (
      v_empresa_id,
      'Fiorella Santacruz',
      '0994199600',
      NULL,
      'fiorella santacruz'
    ),
    (
      v_empresa_id,
      'Fiorella Traversa',
      '0992440957',
      NULL,
      'fiorella traversa'
    ),
    (
      v_empresa_id,
      'Fiorella Vaccotti',
      '0981537178',
      NULL,
      'fiorella vaccotti'
    ),
    (
      v_empresa_id,
      'Fiorella Vaceuud',
      '0981941351',
      NULL,
      'fiorella vaceuud'
    ),
    (
      v_empresa_id,
      'Fiorella Virgili',
      '0984219090',
      NULL,
      'fiorella virgili'
    ),
    (
      v_empresa_id,
      'Fiorrela Traverso',
      '0992440957',
      NULL,
      'fiorrela traverso'
    ),
    (
      v_empresa_id,
      'Flavia Fretes',
      '0992404276',
      NULL,
      'flavia fretes'
    ),
    (
      v_empresa_id,
      'Flavia Gimenez',
      '0991421580',
      NULL,
      'flavia gimenez'
    ),
    (
      v_empresa_id,
      'Florencia Ayala',
      '0992885173',
      NULL,
      'florencia ayala'
    ),
    (
      v_empresa_id,
      'Florencia Boya',
      '0991440717',
      NULL,
      'florencia boya'
    ),
    (
      v_empresa_id,
      'Florencia Fernandez',
      '0971178667',
      NULL,
      'florencia fernandez'
    ),
    (
      v_empresa_id,
      'Florencia Gimenez',
      '0961230788',
      NULL,
      'florencia gimenez'
    ),
    (
      v_empresa_id,
      'Florencia Nunez',
      '0983235822',
      NULL,
      'florencia nunez'
    ),
    (
      v_empresa_id,
      'Florencia Otazu',
      '0981327575',
      NULL,
      'florencia otazu'
    ),
    (
      v_empresa_id,
      'Florencia Ruiz',
      '0994445726',
      '60MIL',
      'florencia ruiz'
    ),
    (
      v_empresa_id,
      'Florencia Vanis',
      '0971528543',
      NULL,
      'florencia vanis'
    ),
    (
      v_empresa_id,
      'Florencia Vaniz',
      '0971528543',
      NULL,
      'florencia vaniz'
    ),
    (
      v_empresa_id,
      'Florentina Galeano',
      '0981768939',
      NULL,
      'florentina galeano'
    ),
    (
      v_empresa_id,
      'Florinda Aguirre',
      '0982781366',
      NULL,
      'florinda aguirre'
    ),
    (
      v_empresa_id,
      'Francisca Garay',
      '0976571299',
      NULL,
      'francisca garay'
    ),
    (
      v_empresa_id,
      'Francisca Mendieta',
      '0974597153',
      NULL,
      'francisca mendieta'
    ),
    (
      v_empresa_id,
      'Francisco Balbuena',
      '0981626281',
      NULL,
      'francisco balbuena'
    ),
    (
      v_empresa_id,
      'Fredy Ibarra',
      '0971438366',
      '20MIL',
      'fredy ibarra'
    ),
    (
      v_empresa_id,
      'Froilan Ojeda',
      '0992670700',
      NULL,
      'froilan ojeda'
    ),
    (
      v_empresa_id,
      'Gabino Aguero',
      '0983834795',
      NULL,
      'gabino aguero'
    ),
    (
      v_empresa_id,
      'Gabriel Benitez',
      '0994383471',
      NULL,
      'gabriel benitez'
    ),
    (
      v_empresa_id,
      'Gabriel Peralta',
      '0971322677',
      '20mil',
      'gabriel peralta'
    ),
    (
      v_empresa_id,
      'Gabriel Romero',
      '0991863043',
      NULL,
      'gabriel romero'
    ),
    (
      v_empresa_id,
      'Gabriela Acosta',
      '0971155392',
      NULL,
      'gabriela acosta'
    ),
    (
      v_empresa_id,
      'Gabriela Almeida',
      '0981972227',
      '30MIL',
      'gabriela almeida'
    ),
    (
      v_empresa_id,
      'Gabriela Amarilla',
      '0982176822',
      '30mil',
      'gabriela amarilla'
    ),
    (
      v_empresa_id,
      'Gabriela Arrua',
      '0982526631',
      NULL,
      'gabriela arrua'
    ),
    (
      v_empresa_id,
      'Gabriela Baez',
      '0994764314',
      NULL,
      'gabriela baez'
    ),
    (
      v_empresa_id,
      'Gabriela Batte',
      '0981315694',
      NULL,
      'gabriela batte'
    ),
    (
      v_empresa_id,
      'Gabriela Benitez',
      '0983657238',
      '10MIL',
      'gabriela benitez'
    ),
    (
      v_empresa_id,
      'Gabriela Bogado',
      '0986558735',
      NULL,
      'gabriela bogado'
    ),
    (
      v_empresa_id,
      'Gabriela Britez',
      '0984313482',
      NULL,
      'gabriela britez'
    ),
    (
      v_empresa_id,
      'Gabriela Cabrera',
      '0982058057',
      NULL,
      'gabriela cabrera'
    ),
    (
      v_empresa_id,
      'Gabriela Caceres',
      '0982396224',
      NULL,
      'gabriela caceres'
    ),
    (
      v_empresa_id,
      'Gabriela Cardozo',
      '9716641576',
      NULL,
      'gabriela cardozo'
    ),
    (
      v_empresa_id,
      'Gabriela Carreras',
      '0992299346',
      NULL,
      'gabriela carreras'
    ),
    (
      v_empresa_id,
      'Gabriela Cristaldo',
      '0994448020',
      NULL,
      'gabriela cristaldo'
    ),
    (
      v_empresa_id,
      'Gabriela Dilascio',
      '0981950054',
      NULL,
      'gabriela dilascio'
    ),
    (
      v_empresa_id,
      'Gabriela Duarte',
      '0994259673',
      NULL,
      'gabriela duarte'
    ),
    (
      v_empresa_id,
      'Gabriela Espinola',
      '0985654818',
      NULL,
      'gabriela espinola'
    ),
    (
      v_empresa_id,
      'Gabriela Flecha',
      '0981513793',
      NULL,
      'gabriela flecha'
    ),
    (
      v_empresa_id,
      'Gabriela Florentin',
      '0982406338',
      NULL,
      'gabriela florentin'
    ),
    (
      v_empresa_id,
      'Gabriela Galeano',
      '0981641936',
      NULL,
      'gabriela galeano'
    ),
    (
      v_empresa_id,
      'Gabriela Gamarra',
      '9825193322',
      NULL,
      'gabriela gamarra'
    ),
    (
      v_empresa_id,
      'Gabriela Garcia',
      '0991748622',
      '1 selo',
      'gabriela garcia'
    ),
    (
      v_empresa_id,
      'Gabriela Garcia Doldan',
      '0981991099',
      NULL,
      'gabriela garcia doldan'
    ),
    (
      v_empresa_id,
      'Gabriela Gomez',
      '0992239602',
      NULL,
      'gabriela gomez'
    ),
    (
      v_empresa_id,
      'Gabriela Gonzalez',
      '0985403165',
      '1 selo (4)',
      'gabriela gonzalez'
    ),
    (
      v_empresa_id,
      'Gabriela Guerrero',
      '0984535808',
      NULL,
      'gabriela guerrero'
    ),
    (
      v_empresa_id,
      'Gabriela Guillen',
      '0981178591',
      NULL,
      'gabriela guillen'
    ),
    (
      v_empresa_id,
      'Gabriela Irala',
      '0981680319',
      NULL,
      'gabriela irala'
    ),
    (
      v_empresa_id,
      'Gabriela Jara',
      '0983640036',
      NULL,
      'gabriela jara'
    ),
    (
      v_empresa_id,
      'Gabriela Lopez',
      '0986758069',
      NULL,
      'gabriela lopez'
    ),
    (
      v_empresa_id,
      'Gabriela Maldonado',
      '0994176340',
      NULL,
      'gabriela maldonado'
    ),
    (
      v_empresa_id,
      'Gabriela Mendoza',
      '0974204378',
      NULL,
      'gabriela mendoza'
    ),
    (
      v_empresa_id,
      'Gabriela Mongelos',
      '0981388680',
      NULL,
      'gabriela mongelos'
    ),
    (
      v_empresa_id,
      'Gabriela Moreno',
      '0985492500',
      NULL,
      'gabriela moreno'
    ),
    (
      v_empresa_id,
      'Gabriela Nunez',
      '0984166907',
      NULL,
      'gabriela nunez'
    ),
    (
      v_empresa_id,
      'Gabriela Ojeda',
      '0981114904',
      NULL,
      'gabriela ojeda'
    ),
    (
      v_empresa_id,
      'Gabriela Paciello',
      '0972179313',
      NULL,
      'gabriela paciello'
    ),
    (
      v_empresa_id,
      'Gabriela Pereira',
      '0982242064',
      NULL,
      'gabriela pereira'
    ),
    (
      v_empresa_id,
      'Gabriela Perez',
      '0982993300',
      NULL,
      'gabriela perez'
    ),
    (
      v_empresa_id,
      'Gabriela Pretamoso',
      '0981852521',
      NULL,
      'gabriela pretamoso'
    ),
    (
      v_empresa_id,
      'Gabriela Prieto',
      '0974290660',
      NULL,
      'gabriela prieto'
    ),
    (
      v_empresa_id,
      'Gabriela Ramirez',
      '0991267178',
      NULL,
      'gabriela ramirez'
    ),
    (
      v_empresa_id,
      'Gabriela Riar',
      '0971980088',
      NULL,
      'gabriela riar'
    ),
    (
      v_empresa_id,
      'Gabriela Ricardi',
      '0982051253',
      NULL,
      'gabriela ricardi'
    ),
    (
      v_empresa_id,
      'Gabriela Rivarola',
      '0994258349',
      NULL,
      'gabriela rivarola'
    ),
    (
      v_empresa_id,
      'Gabriela Riveros',
      '0986249753',
      NULL,
      'gabriela riveros'
    ),
    (
      v_empresa_id,
      'Gabriela Rivros',
      '0986249753',
      NULL,
      'gabriela rivros'
    ),
    (
      v_empresa_id,
      'Gabriela Rodriguez',
      '0991239200',
      NULL,
      'gabriela rodriguez'
    ),
    (
      v_empresa_id,
      'Gabriela Rojas',
      '0981200289',
      NULL,
      'gabriela rojas'
    ),
    (
      v_empresa_id,
      'Gabriela Rotela',
      '0983345578',
      NULL,
      'gabriela rotela'
    ),
    (
      v_empresa_id,
      'Gabriela Ruiz',
      '0972838928',
      NULL,
      'gabriela ruiz'
    ),
    (
      v_empresa_id,
      'Gabriela Samaniego',
      '0991650845',
      NULL,
      'gabriela samaniego'
    ),
    (
      v_empresa_id,
      'Gabriela Servino',
      '0981145641',
      NULL,
      'gabriela servino'
    ),
    (
      v_empresa_id,
      'Gabriela Vera',
      '0981684398',
      NULL,
      'gabriela vera'
    ),
    (
      v_empresa_id,
      'Gabriela Villasanti',
      '0971151474',
      NULL,
      'gabriela villasanti'
    ),
    (
      v_empresa_id,
      'Gabriela Zarza',
      '0983794771',
      '1 selo (1)',
      'gabriela zarza'
    ),
    (
      v_empresa_id,
      'Gabrila dinatale',
      '0992287563',
      NULL,
      'gabrila dinatale'
    ),
    (
      v_empresa_id,
      'Gabruela Wolscham',
      '0971748881',
      NULL,
      'gabruela wolscham'
    ),
    (
      v_empresa_id,
      'Gaciela Rodriguez',
      '0982433002',
      NULL,
      'gaciela rodriguez'
    ),
    (
      v_empresa_id,
      'Galdys Ruiz Diaz',
      '0981285631',
      NULL,
      'galdys ruiz diaz'
    ),
    (
      v_empresa_id,
      'Galilea Ortiz',
      '0987144535',
      NULL,
      'galilea ortiz'
    ),
    (
      v_empresa_id,
      'Gegroria Munoz',
      '0983496712',
      NULL,
      'gegroria munoz'
    ),
    (
      v_empresa_id,
      'Gelber Ortiz',
      '0981879326',
      NULL,
      'gelber ortiz'
    ),
    (
      v_empresa_id,
      'Gendrich',
      '0971401646',
      NULL,
      'gendrich'
    ),
    (
      v_empresa_id,
      'Genesis Linarez',
      '0991777691',
      NULL,
      'genesis linarez'
    ),
    (
      v_empresa_id,
      'Genesis Lopez',
      '0972835222',
      NULL,
      'genesis lopez'
    ),
    (
      v_empresa_id,
      'Geraldi Bedoya',
      '0972593151',
      NULL,
      'geraldi bedoya'
    ),
    (
      v_empresa_id,
      'Geraldine Castillo',
      '0981241689',
      '10MIL',
      'geraldine castillo'
    ),
    (
      v_empresa_id,
      'Geraldine Gimenez',
      '0982417097',
      '10mil',
      'geraldine gimenez'
    ),
    (
      v_empresa_id,
      'Geraldine Giuzio',
      '0982734543',
      NULL,
      'geraldine giuzio'
    ),
    (
      v_empresa_id,
      'Geraldine Patino',
      '0976223659',
      NULL,
      'geraldine patino'
    ),
    (
      v_empresa_id,
      'Gerardo Amarilla',
      '0982961841',
      NULL,
      'gerardo amarilla'
    ),
    (
      v_empresa_id,
      'Gessica',
      '0984470180',
      NULL,
      'gessica'
    ),
    (
      v_empresa_id,
      'Gianella Fleitas',
      '0983431150',
      NULL,
      'gianella fleitas'
    ),
    (
      v_empresa_id,
      'Gianina Friendman',
      '0981419386',
      NULL,
      'gianina friendman'
    ),
    (
      v_empresa_id,
      'Gianina Gonzalez',
      '0985690874',
      NULL,
      'gianina gonzalez'
    ),
    (
      v_empresa_id,
      'Gianina Minadeo',
      '0986648768',
      NULL,
      'gianina minadeo'
    ),
    (
      v_empresa_id,
      'Gianina Vera',
      '0972848845',
      NULL,
      'gianina vera'
    ),
    (
      v_empresa_id,
      'Gianinna Lacarrubba',
      '0981136478',
      NULL,
      'gianinna lacarrubba'
    ),
    (
      v_empresa_id,
      'Giannina Pinheiro',
      '0976597603',
      NULL,
      'giannina pinheiro'
    ),
    (
      v_empresa_id,
      'Giannina Velazquez',
      '0986193667',
      NULL,
      'giannina velazquez'
    ),
    (
      v_empresa_id,
      'Gilbert Ortiz',
      '0982879326',
      '10mil',
      'gilbert ortiz'
    ),
    (
      v_empresa_id,
      'Gilberto Delgado',
      '0971843578',
      NULL,
      'gilberto delgado'
    ),
    (
      v_empresa_id,
      'Gilberto Martinez',
      '0991415382',
      NULL,
      'gilberto martinez'
    ),
    (
      v_empresa_id,
      'Gilda Acosta',
      '0992036721',
      NULL,
      'gilda acosta'
    ),
    (
      v_empresa_id,
      'Gilda Ortellado',
      '0981176991',
      NULL,
      'gilda ortellado'
    ),
    (
      v_empresa_id,
      'Gildana Ciel',
      '0984573952',
      '30mil',
      'gildana ciel'
    ),
    (
      v_empresa_id,
      'Gimena Fernandez',
      '0983060159',
      NULL,
      'gimena fernandez'
    ),
    (
      v_empresa_id,
      'Giovanni Galeano',
      '0976411407',
      NULL,
      'giovanni galeano'
    ),
    (
      v_empresa_id,
      'Giovianna Manavella',
      '0985720928',
      '1 selo (1)',
      'giovianna manavella'
    ),
    (
      v_empresa_id,
      'Giovianna Zavan',
      '0971347647',
      NULL,
      'giovianna zavan'
    ),
    (
      v_empresa_id,
      'Gisel Rodas',
      '0984406198',
      NULL,
      'gisel rodas'
    ),
    (
      v_empresa_id,
      'Gisela Cornet',
      '0971894566',
      NULL,
      'gisela cornet'
    ),
    (
      v_empresa_id,
      'Gisela Gomez',
      '0971754203',
      NULL,
      'gisela gomez'
    ),
    (
      v_empresa_id,
      'Gisela Troche',
      '0994765706',
      NULL,
      'gisela troche'
    ),
    (
      v_empresa_id,
      'Gisele Caballero',
      '0973344268',
      NULL,
      'gisele caballero'
    ),
    (
      v_empresa_id,
      'Gisell Lefebvre',
      '0981483774',
      NULL,
      'gisell lefebvre'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 5: filas 2001..2500
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Gisell Notto',
      '0981240406',
      NULL,
      'gisell notto'
    ),
    (
      v_empresa_id,
      'Gisell Patino',
      '0974565274',
      NULL,
      'gisell patino'
    ),
    (
      v_empresa_id,
      'Gisell Reyes',
      '0993379657',
      NULL,
      'gisell reyes'
    ),
    (
      v_empresa_id,
      'Gisell Rodriguez',
      '0986254896',
      '10mil',
      'gisell rodriguez'
    ),
    (
      v_empresa_id,
      'Gisella Woitschach',
      '0991978881',
      NULL,
      'gisella woitschach'
    ),
    (
      v_empresa_id,
      'Giselle',
      NULL,
      '20 mil',
      'giselle'
    ),
    (
      v_empresa_id,
      'Giselle Benitez',
      '0992812800',
      NULL,
      'giselle benitez'
    ),
    (
      v_empresa_id,
      'Giselle Bouman',
      '0981311665',
      NULL,
      'giselle bouman'
    ),
    (
      v_empresa_id,
      'Giselle De los Rios',
      '0972234153',
      '20mil',
      'giselle de los rios'
    ),
    (
      v_empresa_id,
      'Giselle Galeano',
      '0981656351',
      NULL,
      'giselle galeano'
    ),
    (
      v_empresa_id,
      'Giselle Gavilan',
      '0961345982',
      NULL,
      'giselle gavilan'
    ),
    (
      v_empresa_id,
      'Giselle Gonzalez Torres',
      '0971758255',
      '30mil',
      'giselle gonzalez torres'
    ),
    (
      v_empresa_id,
      'Giselle Montanholi',
      '0981259697',
      NULL,
      'giselle montanholi'
    ),
    (
      v_empresa_id,
      'Giselle Moringo',
      '0992991661',
      NULL,
      'giselle moringo'
    ),
    (
      v_empresa_id,
      'Giselle Notto',
      '0984704511',
      NULL,
      'giselle notto'
    ),
    (
      v_empresa_id,
      'Giselle Preda',
      '0981176839',
      '1 selo (1)',
      'giselle preda'
    ),
    (
      v_empresa_id,
      'Giselle Rodriguez',
      NULL,
      NULL,
      'giselle rodriguez'
    ),
    (
      v_empresa_id,
      'Giselle Vaesken',
      '0981478782',
      NULL,
      'giselle vaesken'
    ),
    (
      v_empresa_id,
      'Giselle Vargas',
      '0984777038',
      '10mil',
      'giselle vargas'
    ),
    (
      v_empresa_id,
      'Giselle Venegas',
      '0972549458',
      NULL,
      'giselle venegas'
    ),
    (
      v_empresa_id,
      'Giselle Vera',
      '0971428008',
      NULL,
      'giselle vera'
    ),
    (
      v_empresa_id,
      'Giselle Villamayor',
      '0991903339',
      NULL,
      'giselle villamayor'
    ),
    (
      v_empresa_id,
      'Gissel Fernandez',
      '0973657680',
      NULL,
      'gissel fernandez'
    ),
    (
      v_empresa_id,
      'Gissel Saldivar',
      '0981205362',
      NULL,
      'gissel saldivar'
    ),
    (
      v_empresa_id,
      'Gissel Samaniego',
      '0986458186',
      NULL,
      'gissel samaniego'
    ),
    (
      v_empresa_id,
      'Gissela Gomez',
      '0971754203',
      '10MIL',
      'gissela gomez'
    ),
    (
      v_empresa_id,
      'Gissele Gonsalez',
      '0994303395',
      NULL,
      'gissele gonsalez'
    ),
    (
      v_empresa_id,
      'Gissella Cornet',
      '0971894566',
      NULL,
      'gissella cornet'
    ),
    (
      v_empresa_id,
      'Gisselle Canteros',
      '0971731705',
      NULL,
      'gisselle canteros'
    ),
    (
      v_empresa_id,
      'Gisselle Montanholi',
      '0981259697',
      NULL,
      'gisselle montanholi'
    ),
    (
      v_empresa_id,
      'Gisselle Rojas',
      '0971791120',
      NULL,
      'gisselle rojas'
    ),
    (
      v_empresa_id,
      'Gisselle Ruiz',
      '0982765051',
      NULL,
      'gisselle ruiz'
    ),
    (
      v_empresa_id,
      'Giszelle Vidal',
      '0981114551',
      NULL,
      'giszelle vidal'
    ),
    (
      v_empresa_id,
      'Giuliana Cantero',
      '0976659908',
      NULL,
      'giuliana cantero'
    ),
    (
      v_empresa_id,
      'Giuliano Diaz',
      '0976376678',
      NULL,
      'giuliano diaz'
    ),
    (
      v_empresa_id,
      'Gladdys',
      '0981285631',
      NULL,
      'gladdys'
    ),
    (
      v_empresa_id,
      'Gladys Aquino',
      '0981068204',
      NULL,
      'gladys aquino'
    ),
    (
      v_empresa_id,
      'Gladys Cano',
      '0985759775',
      NULL,
      'gladys cano'
    ),
    (
      v_empresa_id,
      'Gladys De Osolo',
      '0981235144',
      NULL,
      'gladys de osolo'
    ),
    (
      v_empresa_id,
      'Gladys Denis',
      '0981952105',
      NULL,
      'gladys denis'
    ),
    (
      v_empresa_id,
      'Gladys Escobar',
      '0986198523',
      NULL,
      'gladys escobar'
    ),
    (
      v_empresa_id,
      'Gladys Gavone',
      '0971215131',
      NULL,
      'gladys gavone'
    ),
    (
      v_empresa_id,
      'Gladys Gonzalez',
      '0974261206',
      NULL,
      'gladys gonzalez'
    ),
    (
      v_empresa_id,
      'Gladys Jolly',
      '0981911578',
      NULL,
      'gladys jolly'
    ),
    (
      v_empresa_id,
      'Gladys Lopez Duarte',
      '0981146745',
      NULL,
      'gladys lopez duarte'
    ),
    (
      v_empresa_id,
      'Gladys Maria',
      '0983774989',
      NULL,
      'gladys maria'
    ),
    (
      v_empresa_id,
      'Gladys Melgarejo',
      '0981994242',
      NULL,
      'gladys melgarejo'
    ),
    (
      v_empresa_id,
      'Gladys Ure',
      '0981265070',
      NULL,
      'gladys ure'
    ),
    (
      v_empresa_id,
      'Glavia Gonzalez',
      '0981190165',
      NULL,
      'glavia gonzalez'
    ),
    (
      v_empresa_id,
      'Glicel Tavalos',
      '0975201101',
      NULL,
      'glicel tavalos'
    ),
    (
      v_empresa_id,
      'Gloria Asilvera',
      '0981495100',
      NULL,
      'gloria asilvera'
    ),
    (
      v_empresa_id,
      'Gloria Benitez',
      '0971506357',
      NULL,
      'gloria benitez'
    ),
    (
      v_empresa_id,
      'Gloria Benittez',
      '0985624418',
      NULL,
      'gloria benittez'
    ),
    (
      v_empresa_id,
      'Gloria Bergen',
      '0971427053',
      NULL,
      'gloria bergen'
    ),
    (
      v_empresa_id,
      'Gloria Caballero',
      '0992259773',
      NULL,
      'gloria caballero'
    ),
    (
      v_empresa_id,
      'Gloria Duarte',
      '0995635917',
      NULL,
      'gloria duarte'
    ),
    (
      v_empresa_id,
      'Gloria Ferreira',
      '0971907119',
      NULL,
      'gloria ferreira'
    ),
    (
      v_empresa_id,
      'Gloria Flor',
      '0981197663',
      NULL,
      'gloria flor'
    ),
    (
      v_empresa_id,
      'Gloria Garua',
      '0982874403',
      NULL,
      'gloria garua'
    ),
    (
      v_empresa_id,
      'Gloria Larrosa',
      '0981819402',
      NULL,
      'gloria larrosa'
    ),
    (
      v_empresa_id,
      'Gloria Latourrette',
      '0994317713',
      NULL,
      'gloria latourrette'
    ),
    (
      v_empresa_id,
      'Gloria Melgarejo',
      '0981866363',
      NULL,
      'gloria melgarejo'
    ),
    (
      v_empresa_id,
      'Gloria Morel',
      '0981522838',
      NULL,
      'gloria morel'
    ),
    (
      v_empresa_id,
      'Gloria Nunes',
      '0982355112',
      NULL,
      'gloria nunes'
    ),
    (
      v_empresa_id,
      'Gloria Nunez',
      '0982355112',
      NULL,
      'gloria nunez'
    ),
    (
      v_empresa_id,
      'Gloria Nunnhez',
      '0982176273',
      NULL,
      'gloria nunnhez'
    ),
    (
      v_empresa_id,
      'Gloria Portillo',
      '0982925307',
      NULL,
      'gloria portillo'
    ),
    (
      v_empresa_id,
      'Gloria Rodriguez',
      '0981732651',
      NULL,
      'gloria rodriguez'
    ),
    (
      v_empresa_id,
      'Gloria Ruiz Dias',
      '0983448513',
      '10mil',
      'gloria ruiz dias'
    ),
    (
      v_empresa_id,
      'Gloria Sangriar',
      '0976193723',
      NULL,
      'gloria sangriar'
    ),
    (
      v_empresa_id,
      'Gloria Torres',
      '0984102057',
      NULL,
      'gloria torres'
    ),
    (
      v_empresa_id,
      'Gloria Villar',
      '0994200248',
      NULL,
      'gloria villar'
    ),
    (
      v_empresa_id,
      'Gloria Zarza',
      '0972639126',
      NULL,
      'gloria zarza'
    ),
    (
      v_empresa_id,
      'Godelieve De Bleeck',
      '0994200328',
      NULL,
      'godelieve de bleeck'
    ),
    (
      v_empresa_id,
      'Gonzalo Arce',
      '0986517693',
      NULL,
      'gonzalo arce'
    ),
    (
      v_empresa_id,
      'Govanni Vissani',
      '0985148851',
      '20mil',
      'govanni vissani'
    ),
    (
      v_empresa_id,
      'Graciela Alarcon',
      '0971116997',
      NULL,
      'graciela alarcon'
    ),
    (
      v_empresa_id,
      'Graciela Arguello',
      '0981700735',
      NULL,
      'graciela arguello'
    ),
    (
      v_empresa_id,
      'Graciela Awuino',
      '0984952899',
      NULL,
      'graciela awuino'
    ),
    (
      v_empresa_id,
      'Graciela Frutos',
      '0972124568',
      '20mil',
      'graciela frutos'
    ),
    (
      v_empresa_id,
      'Graciela Melgarejo',
      '0992400453',
      NULL,
      'graciela melgarejo'
    ),
    (
      v_empresa_id,
      'Graciela Montanea',
      '0981790953',
      NULL,
      'graciela montanea'
    ),
    (
      v_empresa_id,
      'Graciela Moreno',
      '0994763997',
      NULL,
      'graciela moreno'
    ),
    (
      v_empresa_id,
      'Graciela Ortega',
      '0982232241',
      NULL,
      'graciela ortega'
    ),
    (
      v_empresa_id,
      'Graciela Ottega',
      '0982232241',
      NULL,
      'graciela ottega'
    ),
    (
      v_empresa_id,
      'Graciela Rodriguez',
      '0982433002',
      NULL,
      'graciela rodriguez'
    ),
    (
      v_empresa_id,
      'Graciela Romero',
      '0991345671',
      NULL,
      'graciela romero'
    ),
    (
      v_empresa_id,
      'Graciela Rotela',
      '0984480128',
      NULL,
      'graciela rotela'
    ),
    (
      v_empresa_id,
      'Graciela talavera',
      '0971380930',
      NULL,
      'graciela talavera'
    ),
    (
      v_empresa_id,
      'Graciela Vera',
      '0982184062',
      NULL,
      'graciela vera'
    ),
    (
      v_empresa_id,
      'Greta Romero',
      '0982270859',
      NULL,
      'greta romero'
    ),
    (
      v_empresa_id,
      'Gricelda Candia',
      '0971779587',
      NULL,
      'gricelda candia'
    ),
    (
      v_empresa_id,
      'Grisel Acuna',
      '0984652441',
      '10mil',
      'grisel acuna'
    ),
    (
      v_empresa_id,
      'Grisel Galeano',
      '0983653133',
      NULL,
      'grisel galeano'
    ),
    (
      v_empresa_id,
      'Griselda Bracho',
      '0991417411',
      NULL,
      'griselda bracho'
    ),
    (
      v_empresa_id,
      'Griselda Ca;ete',
      '0985286995',
      '10mil',
      'griselda ca;ete'
    ),
    (
      v_empresa_id,
      'Griselda Candia',
      '0971779587',
      NULL,
      'griselda candia'
    ),
    (
      v_empresa_id,
      'Griselda Cantero',
      '0983659654',
      NULL,
      'griselda cantero'
    ),
    (
      v_empresa_id,
      'Griselda Florentin',
      '0982928021',
      NULL,
      'griselda florentin'
    ),
    (
      v_empresa_id,
      'Griselda Florentino',
      '0982928021',
      NULL,
      'griselda florentino'
    ),
    (
      v_empresa_id,
      'Griselda Gonzalez',
      '0984118779',
      NULL,
      'griselda gonzalez'
    ),
    (
      v_empresa_id,
      'Griselda Liste',
      '0981892928',
      NULL,
      'griselda liste'
    ),
    (
      v_empresa_id,
      'Griselda Rodas',
      '0972592751',
      NULL,
      'griselda rodas'
    ),
    (
      v_empresa_id,
      'Griselda Villamallor',
      '0984879348',
      '10mil',
      'griselda villamallor'
    ),
    (
      v_empresa_id,
      'Griselda Zarza',
      '0985453100',
      NULL,
      'griselda zarza'
    ),
    (
      v_empresa_id,
      'Gsbriela Gomez',
      '0985365400',
      '30mil',
      'gsbriela gomez'
    ),
    (
      v_empresa_id,
      'Guadalupe Aquino',
      '0971365633',
      NULL,
      'guadalupe aquino'
    ),
    (
      v_empresa_id,
      'Guadalupe Cabrera',
      '0991910504',
      '10mil',
      'guadalupe cabrera'
    ),
    (
      v_empresa_id,
      'Guadalupe Cearballo',
      '0984188600',
      NULL,
      'guadalupe cearballo'
    ),
    (
      v_empresa_id,
      'Guadalupe Centurion',
      '0981757826',
      NULL,
      'guadalupe centurion'
    ),
    (
      v_empresa_id,
      'Guadalupe Chena',
      '0982151393',
      NULL,
      'guadalupe chena'
    ),
    (
      v_empresa_id,
      'Guadalupe Esapinola',
      '0984165470',
      '20MIL',
      'guadalupe esapinola'
    ),
    (
      v_empresa_id,
      'Guadalupe Figueredo',
      '0994981524',
      NULL,
      'guadalupe figueredo'
    ),
    (
      v_empresa_id,
      'Guadalupe Flores',
      '0984542946',
      NULL,
      'guadalupe flores'
    ),
    (
      v_empresa_id,
      'Guadalupe Godoy',
      '0992929713',
      NULL,
      'guadalupe godoy'
    ),
    (
      v_empresa_id,
      'Guadalupe Gonzalez',
      '0974260990',
      NULL,
      'guadalupe gonzalez'
    ),
    (
      v_empresa_id,
      'Guadalupe Hunicken',
      '0981256454',
      '10mil',
      'guadalupe hunicken'
    ),
    (
      v_empresa_id,
      'Guadalupe Marecos',
      '0972790763',
      '10mil',
      'guadalupe marecos'
    ),
    (
      v_empresa_id,
      'Guadalupe Martinez',
      '0992680059',
      NULL,
      'guadalupe martinez'
    ),
    (
      v_empresa_id,
      'Guadalupe Melo',
      '0981448499',
      NULL,
      'guadalupe melo'
    ),
    (
      v_empresa_id,
      'Guadalupe Patilla',
      '0992464364',
      NULL,
      'guadalupe patilla'
    ),
    (
      v_empresa_id,
      'Guadalupe Penayo',
      '0986370661',
      NULL,
      'guadalupe penayo'
    ),
    (
      v_empresa_id,
      'Guadalupe Pereira',
      '0984364792',
      NULL,
      'guadalupe pereira'
    ),
    (
      v_empresa_id,
      'Guadalupe Perez',
      '0981175683',
      NULL,
      'guadalupe perez'
    ),
    (
      v_empresa_id,
      'Guadalupe Rodriguez',
      '0981800647',
      NULL,
      'guadalupe rodriguez'
    ),
    (
      v_empresa_id,
      'Guadalupe Sanchez',
      '0991782123',
      NULL,
      'guadalupe sanchez'
    ),
    (
      v_empresa_id,
      'Guadalupe Torres',
      '0981536371',
      '10mil',
      'guadalupe torres'
    ),
    (
      v_empresa_id,
      'Guadalupe Veloto',
      '0972769322',
      '30MIL',
      'guadalupe veloto'
    ),
    (
      v_empresa_id,
      'Gudelia Notario',
      '0973723414',
      '20MIL',
      'gudelia notario'
    ),
    (
      v_empresa_id,
      'Guido Boselli',
      '0995660660',
      NULL,
      'guido boselli'
    ),
    (
      v_empresa_id,
      'Guido Quinhonez',
      '0974904249',
      '20mil',
      'guido quinhonez'
    ),
    (
      v_empresa_id,
      'Guido Quinonez',
      '0974904249',
      NULL,
      'guido quinonez'
    ),
    (
      v_empresa_id,
      'Guillermina Roa',
      '0981853406',
      NULL,
      'guillermina roa'
    ),
    (
      v_empresa_id,
      'Guillermo Fernandez',
      '98122451',
      '10mil',
      'guillermo fernandez'
    ),
    (
      v_empresa_id,
      'Gustavo Prieto Alegre',
      '0982911080',
      NULL,
      'gustavo prieto alegre'
    ),
    (
      v_empresa_id,
      'Gustavo Sanchez',
      '0985237792',
      NULL,
      'gustavo sanchez'
    ),
    (
      v_empresa_id,
      'Gustavo Silvero',
      '0981773182',
      NULL,
      'gustavo silvero'
    ),
    (
      v_empresa_id,
      'Guzman Lugo',
      '0984892792',
      NULL,
      'guzman lugo'
    ),
    (
      v_empresa_id,
      'Hamouby Salen',
      '0971245486',
      NULL,
      'hamouby salen'
    ),
    (
      v_empresa_id,
      'Hanna Cantero',
      '0981370045',
      NULL,
      'hanna cantero'
    ),
    (
      v_empresa_id,
      'Harumi Kikuchi',
      '0982890960',
      NULL,
      'harumi kikuchi'
    ),
    (
      v_empresa_id,
      'Hebillas monos y vinchas',
      NULL,
      NULL,
      'hebillas monos y vinchas'
    ),
    (
      v_empresa_id,
      'Hector Osoi',
      '0984675631',
      '10mil',
      'hector osoi'
    ),
    (
      v_empresa_id,
      'Hee Kim',
      '0981010901',
      NULL,
      'hee kim'
    ),
    (
      v_empresa_id,
      'Heidy Barrios',
      '0984080210',
      NULL,
      'heidy barrios'
    ),
    (
      v_empresa_id,
      'Heidy Libardi',
      '0991976293',
      '10MIL',
      'heidy libardi'
    ),
    (
      v_empresa_id,
      'Helen Adorno',
      '0984082681',
      '20mil',
      'helen adorno'
    ),
    (
      v_empresa_id,
      'Helen Aleman',
      '0972878675',
      '1 selo (4)',
      'helen aleman'
    ),
    (
      v_empresa_id,
      'Helen Garcia',
      '9974729147',
      NULL,
      'helen garcia'
    ),
    (
      v_empresa_id,
      'Helen Martinez',
      '0994252630',
      NULL,
      'helen martinez'
    ),
    (
      v_empresa_id,
      'Helen Yanet Aquino',
      '0982721740',
      NULL,
      'helen yanet aquino'
    ),
    (
      v_empresa_id,
      'Helena Martinez',
      NULL,
      NULL,
      'helena martinez'
    ),
    (
      v_empresa_id,
      'Helena Villanueva',
      '0972194020',
      NULL,
      'helena villanueva'
    ),
    (
      v_empresa_id,
      'Hemelinda Jara',
      '0971202214',
      NULL,
      'hemelinda jara'
    ),
    (
      v_empresa_id,
      'Henry Schroeder',
      '0971412517',
      NULL,
      'henry schroeder'
    ),
    (
      v_empresa_id,
      'Hernan Fernandez',
      '0985429323',
      NULL,
      'hernan fernandez'
    ),
    (
      v_empresa_id,
      'Hernan Gonzalez',
      '0991705370',
      NULL,
      'hernan gonzalez'
    ),
    (
      v_empresa_id,
      'Hernan herrera',
      '0981794805',
      '30mil',
      'hernan herrera'
    ),
    (
      v_empresa_id,
      'Hillary Rodriguez',
      '0976998318',
      NULL,
      'hillary rodriguez'
    ),
    (
      v_empresa_id,
      'Hugo Barrios',
      '0981764150',
      NULL,
      'hugo barrios'
    ),
    (
      v_empresa_id,
      'Hugo Celada',
      '0983346555',
      NULL,
      'hugo celada'
    ),
    (
      v_empresa_id,
      'Hugo Nunez',
      '0981397547',
      NULL,
      'hugo nunez'
    ),
    (
      v_empresa_id,
      'Hugo Roman',
      '0971127141',
      NULL,
      'hugo roman'
    ),
    (
      v_empresa_id,
      'Hugo Sandoval',
      '0981912002',
      NULL,
      'hugo sandoval'
    ),
    (
      v_empresa_id,
      'Humberto Ojeda',
      '0981196376',
      '1 selo (1)',
      'humberto ojeda'
    ),
    (
      v_empresa_id,
      'Hyejin Yang',
      '0981287677',
      NULL,
      'hyejin yang'
    ),
    (
      v_empresa_id,
      'Iara Sejas',
      '0981480578',
      NULL,
      'iara sejas'
    ),
    (
      v_empresa_id,
      'Ibeth Benitez',
      '0982179985',
      NULL,
      'ibeth benitez'
    ),
    (
      v_empresa_id,
      'Ida Prieto',
      '0981594243',
      NULL,
      'ida prieto'
    ),
    (
      v_empresa_id,
      'Idalida Vera',
      '0972433135',
      NULL,
      'idalida vera'
    ),
    (
      v_empresa_id,
      'Idalina Pena',
      '0984390267',
      NULL,
      'idalina pena'
    ),
    (
      v_empresa_id,
      'Idalina Vera',
      '0982541848',
      '10mil',
      'idalina vera'
    ),
    (
      v_empresa_id,
      'Idia Belen Godoy',
      '0981776617',
      NULL,
      'idia belen godoy'
    ),
    (
      v_empresa_id,
      'Ignacia Ayala',
      '0982713415',
      NULL,
      'ignacia ayala'
    ),
    (
      v_empresa_id,
      'Iirs Sanabria',
      NULL,
      NULL,
      'iirs sanabria'
    ),
    (
      v_empresa_id,
      'Ilda Britez',
      '0985862503',
      NULL,
      'ilda britez'
    ),
    (
      v_empresa_id,
      'Ileana Martinez',
      '0992453809',
      NULL,
      'ileana martinez'
    ),
    (
      v_empresa_id,
      'Ilia Inostroza',
      '0992442368',
      NULL,
      'ilia inostroza'
    ),
    (
      v_empresa_id,
      'Iliana Martinez',
      '0992453809',
      NULL,
      'iliana martinez'
    ),
    (
      v_empresa_id,
      'Iliana Rubin',
      '0992200330',
      NULL,
      'iliana rubin'
    ),
    (
      v_empresa_id,
      'Ilsa Flores',
      '0986535470',
      NULL,
      'ilsa flores'
    ),
    (
      v_empresa_id,
      'Iluminada Gomez',
      '0981826362',
      NULL,
      'iluminada gomez'
    ),
    (
      v_empresa_id,
      'Indira Tamis',
      '0982579832',
      NULL,
      'indira tamis'
    ),
    (
      v_empresa_id,
      'Ines Duarte',
      '0985806092',
      NULL,
      'ines duarte'
    ),
    (
      v_empresa_id,
      'Ines Fernandez',
      '0961940835',
      NULL,
      'ines fernandez'
    ),
    (
      v_empresa_id,
      'Ines Florentin',
      '0983689685',
      NULL,
      'ines florentin'
    ),
    (
      v_empresa_id,
      'Ines Guerrenho',
      '9812330411',
      NULL,
      'ines guerrenho'
    ),
    (
      v_empresa_id,
      'Ines Guzman',
      '0976129442',
      NULL,
      'ines guzman'
    ),
    (
      v_empresa_id,
      'Ines Martinez',
      '0981715629',
      NULL,
      'ines martinez'
    ),
    (
      v_empresa_id,
      'Ingreso de Lillo',
      NULL,
      NULL,
      'ingreso de lillo'
    ),
    (
      v_empresa_id,
      'Ingreso Lillo',
      NULL,
      NULL,
      'ingreso lillo'
    ),
    (
      v_empresa_id,
      'Ingreso Tassi',
      NULL,
      NULL,
      'ingreso tassi'
    ),
    (
      v_empresa_id,
      'Ingrid Arriola',
      '0971783679',
      NULL,
      'ingrid arriola'
    ),
    (
      v_empresa_id,
      'Ingrid Ayala',
      '9817293815',
      '20mil',
      'ingrid ayala'
    ),
    (
      v_empresa_id,
      'Ingrid Barrios',
      '0985310447',
      '30mil',
      'ingrid barrios'
    ),
    (
      v_empresa_id,
      'Ingrid Bianconi',
      '0981513252',
      NULL,
      'ingrid bianconi'
    ),
    (
      v_empresa_id,
      'Ingrid Centurion',
      '0971111192',
      '1 selo (1)',
      'ingrid centurion'
    ),
    (
      v_empresa_id,
      'Ingrid Dapper',
      '0982915651',
      NULL,
      'ingrid dapper'
    ),
    (
      v_empresa_id,
      'Ingrid Espinola',
      '0984908708',
      NULL,
      'ingrid espinola'
    ),
    (
      v_empresa_id,
      'Ingrid Guerrero',
      '0991946583',
      NULL,
      'ingrid guerrero'
    ),
    (
      v_empresa_id,
      'Ingrid Noguera',
      '0986805970',
      '10mil',
      'ingrid noguera'
    ),
    (
      v_empresa_id,
      'Ingrid Pereyra',
      '0971255370',
      NULL,
      'ingrid pereyra'
    ),
    (
      v_empresa_id,
      'Ingrid Pingitzer',
      '0971982962',
      NULL,
      'ingrid pingitzer'
    ),
    (
      v_empresa_id,
      'Ingrid Villasanti',
      '0961644524',
      NULL,
      'ingrid villasanti'
    ),
    (
      v_empresa_id,
      'Ingrit Noguera',
      '0986805970',
      NULL,
      'ingrit noguera'
    ),
    (
      v_empresa_id,
      'Io Villalba',
      '0976853527',
      NULL,
      'io villalba'
    ),
    (
      v_empresa_id,
      'Irene Bareiro',
      '0981435961',
      NULL,
      'irene bareiro'
    ),
    (
      v_empresa_id,
      'Iricie Godoy',
      '0982527086',
      NULL,
      'iricie godoy'
    ),
    (
      v_empresa_id,
      'Irina Germann',
      '0981133473',
      NULL,
      'irina germann'
    ),
    (
      v_empresa_id,
      'Irina Obarski',
      '0983102594',
      NULL,
      'irina obarski'
    ),
    (
      v_empresa_id,
      'Iris Alcaraz',
      '0981677652',
      '10mil\',
      'iris alcaraz'
    ),
    (
      v_empresa_id,
      'Iris Lopez',
      '0981870397',
      '10mil',
      'iris lopez'
    ),
    (
      v_empresa_id,
      'Iris Olivetti',
      '0985833754',
      NULL,
      'iris olivetti'
    ),
    (
      v_empresa_id,
      'Iris Sanabria',
      '0973469489',
      NULL,
      'iris sanabria'
    ),
    (
      v_empresa_id,
      'Iris Silvero',
      '0992231384',
      '10mil',
      'iris silvero'
    ),
    (
      v_empresa_id,
      'irma cabrera',
      '0982058057',
      NULL,
      'irma cabrera'
    ),
    (
      v_empresa_id,
      'Irma Romina Ranoni',
      '0986399171',
      NULL,
      'irma romina ranoni'
    ),
    (
      v_empresa_id,
      'ISAAC Bueckert',
      '0981866752',
      '10mil',
      'isaac bueckert'
    ),
    (
      v_empresa_id,
      'Isabel Baez',
      '0992540373',
      NULL,
      'isabel baez'
    ),
    (
      v_empresa_id,
      'Isabel Caballero',
      '0974872389',
      '1 selo (1)',
      'isabel caballero'
    ),
    (
      v_empresa_id,
      'Isabel Caceres',
      '0981265683',
      NULL,
      'isabel caceres'
    ),
    (
      v_empresa_id,
      'Isabel Diaz',
      '0984308648',
      NULL,
      'isabel diaz'
    ),
    (
      v_empresa_id,
      'Isabel Franco',
      '0961492757',
      NULL,
      'isabel franco'
    ),
    (
      v_empresa_id,
      'Isabel Gomez',
      '0991927969',
      NULL,
      'isabel gomez'
    ),
    (
      v_empresa_id,
      'Isabel Ortiz',
      '0981259114',
      NULL,
      'isabel ortiz'
    ),
    (
      v_empresa_id,
      'Isabel Segovia',
      '0986314426',
      NULL,
      'isabel segovia'
    ),
    (
      v_empresa_id,
      'Isabel Vallejo',
      '0982597625',
      NULL,
      'isabel vallejo'
    ),
    (
      v_empresa_id,
      'Isabell Estigarribia',
      '0974595739',
      NULL,
      'isabell estigarribia'
    ),
    (
      v_empresa_id,
      'Isabella Disani',
      '0991705777',
      NULL,
      'isabella disani'
    ),
    (
      v_empresa_id,
      'Isabella Pisani',
      '0991705777',
      '10MIL',
      'isabella pisani'
    ),
    (
      v_empresa_id,
      'Isabella Velloso',
      '0991293371',
      NULL,
      'isabella velloso'
    ),
    (
      v_empresa_id,
      'Isable Espinola',
      '0983728919',
      NULL,
      'isable espinola'
    ),
    (
      v_empresa_id,
      'Isaias Machuca',
      '0986543701',
      '1 selo (1)',
      'isaias machuca'
    ),
    (
      v_empresa_id,
      'Isaias Rolon',
      '0994346766',
      NULL,
      'isaias rolon'
    ),
    (
      v_empresa_id,
      'Isamar Farina',
      '0985647383',
      NULL,
      'isamar farina'
    ),
    (
      v_empresa_id,
      'Isamara Recalde',
      '0982864600',
      NULL,
      'isamara recalde'
    ),
    (
      v_empresa_id,
      'Ismar Pineda',
      '0985749012',
      NULL,
      'ismar pineda'
    ),
    (
      v_empresa_id,
      'itaipu',
      NULL,
      NULL,
      'itaipu'
    ),
    (
      v_empresa_id,
      'Ivan Benegas',
      '0994490683',
      NULL,
      'ivan benegas'
    ),
    (
      v_empresa_id,
      'Ivan Castro',
      '0984227563',
      '10mil',
      'ivan castro'
    ),
    (
      v_empresa_id,
      'Ivan Garcete',
      '0986100482',
      NULL,
      'ivan garcete'
    ),
    (
      v_empresa_id,
      'Ivan Pineda',
      '0982810981',
      NULL,
      'ivan pineda'
    ),
    (
      v_empresa_id,
      'Ivan Villalba',
      '0982675007',
      NULL,
      'ivan villalba'
    ),
    (
      v_empresa_id,
      'Ivan Zarza',
      '0991455166',
      '10mil',
      'ivan zarza'
    ),
    (
      v_empresa_id,
      'Ivana Galeano',
      '0976268521',
      '10MIL',
      'ivana galeano'
    ),
    (
      v_empresa_id,
      'Ivana Medin',
      '0992483401',
      NULL,
      'ivana medin'
    ),
    (
      v_empresa_id,
      'Ivana Rammirez',
      '0984958817',
      NULL,
      'ivana rammirez'
    ),
    (
      v_empresa_id,
      'Ivana Rivarola',
      '0986650955',
      NULL,
      'ivana rivarola'
    ),
    (
      v_empresa_id,
      'Ivanna Escobar',
      '0991212487',
      NULL,
      'ivanna escobar'
    ),
    (
      v_empresa_id,
      'Ivanna Ramirez',
      '0984958817',
      NULL,
      'ivanna ramirez'
    ),
    (
      v_empresa_id,
      'Ivette Benitez',
      '0982179985',
      NULL,
      'ivette benitez'
    ),
    (
      v_empresa_id,
      'Ivette Moran',
      '0981268036',
      NULL,
      'ivette moran'
    ),
    (
      v_empresa_id,
      'Ivette Palmerola',
      '0994470200',
      NULL,
      'ivette palmerola'
    ),
    (
      v_empresa_id,
      'Ivon Ahrens',
      '0992255244',
      NULL,
      'ivon ahrens'
    ),
    (
      v_empresa_id,
      'Jacinta Benitez',
      '0982905632',
      NULL,
      'jacinta benitez'
    ),
    (
      v_empresa_id,
      'Jade Gimenez',
      '0976383677',
      NULL,
      'jade gimenez'
    ),
    (
      v_empresa_id,
      'Jaeanne Zuniga',
      '0983234508',
      NULL,
      'jaeanne zuniga'
    ),
    (
      v_empresa_id,
      'Jamila Vera',
      '0981276337',
      NULL,
      'jamila vera'
    ),
    (
      v_empresa_id,
      'Jamile Benitez',
      '0981616231',
      '1 selo (1)',
      'jamile benitez'
    ),
    (
      v_empresa_id,
      'Jamin Ortigoza',
      '0992497635',
      NULL,
      'jamin ortigoza'
    ),
    (
      v_empresa_id,
      'Jana Lugo',
      '0971174072',
      NULL,
      'jana lugo'
    ),
    (
      v_empresa_id,
      'Janaina Ferrerira',
      '0991901403',
      NULL,
      'janaina ferrerira'
    ),
    (
      v_empresa_id,
      'Jane Schmeing',
      '0984844868',
      '10mil',
      'jane schmeing'
    ),
    (
      v_empresa_id,
      'Janely Romero',
      '0971143301',
      NULL,
      'janely romero'
    ),
    (
      v_empresa_id,
      'Janet Walde',
      '0981652659',
      NULL,
      'janet walde'
    ),
    (
      v_empresa_id,
      'Jania Pineno',
      '0976597603',
      NULL,
      'jania pineno'
    ),
    (
      v_empresa_id,
      'Janice Gill',
      '0981474042',
      '10mil',
      'janice gill'
    ),
    (
      v_empresa_id,
      'Janice Gimenez',
      '0985101284',
      '20mil',
      'janice gimenez'
    ),
    (
      v_empresa_id,
      'Janice Jimenez',
      '0985101284',
      NULL,
      'janice jimenez'
    ),
    (
      v_empresa_id,
      'Janina Almiron',
      '0981887180',
      NULL,
      'janina almiron'
    ),
    (
      v_empresa_id,
      'Janina Barrios',
      '0992883152',
      NULL,
      'janina barrios'
    ),
    (
      v_empresa_id,
      'Janina Fretes',
      '0994887765',
      '10MIL',
      'janina fretes'
    ),
    (
      v_empresa_id,
      'Janina Friendman',
      '0981419386',
      NULL,
      'janina friendman'
    ),
    (
      v_empresa_id,
      'Janina Miranda',
      '0991193401',
      NULL,
      'janina miranda'
    ),
    (
      v_empresa_id,
      'Janina Orrego',
      '0983529363',
      NULL,
      'janina orrego'
    ),
    (
      v_empresa_id,
      'Janina Portillo',
      '0985989685',
      NULL,
      'janina portillo'
    ),
    (
      v_empresa_id,
      'Janina Vargas',
      '0984531820',
      '1 selo (1)',
      'janina vargas'
    ),
    (
      v_empresa_id,
      'Janina Zeballos',
      '0971216561',
      NULL,
      'janina zeballos'
    ),
    (
      v_empresa_id,
      'Janise Britez',
      '0995352280',
      NULL,
      'janise britez'
    ),
    (
      v_empresa_id,
      'Jannine Groselle',
      '0991188263',
      '1 selO (3)',
      'jannine groselle'
    ),
    (
      v_empresa_id,
      'Jaquelin Canteros',
      '0981614397',
      NULL,
      'jaquelin canteros'
    ),
    (
      v_empresa_id,
      'Jaquelin Gonzalez',
      '0981654844',
      '1 selo (1)',
      'jaquelin gonzalez'
    ),
    (
      v_empresa_id,
      'Jaquelin Martinrz',
      '0994941749',
      NULL,
      'jaquelin martinrz'
    ),
    (
      v_empresa_id,
      'Jaquelin Riquelme',
      '0994905866',
      NULL,
      'jaquelin riquelme'
    ),
    (
      v_empresa_id,
      'Jaqueline Aquino',
      '0981826639',
      NULL,
      'jaqueline aquino'
    ),
    (
      v_empresa_id,
      'Javier Castillo',
      '0985193488',
      NULL,
      'javier castillo'
    ),
    (
      v_empresa_id,
      'Javier Chavez',
      '0985531512',
      NULL,
      'javier chavez'
    ),
    (
      v_empresa_id,
      'Javier Gomez',
      '0961674073',
      NULL,
      'javier gomez'
    ),
    (
      v_empresa_id,
      'Javier Recalde',
      '0981915876',
      NULL,
      'javier recalde'
    ),
    (
      v_empresa_id,
      'Jaz Mercado',
      NULL,
      NULL,
      'jaz mercado'
    ),
    (
      v_empresa_id,
      'Jazeli Hermosilla',
      '0976565157',
      NULL,
      'jazeli hermosilla'
    ),
    (
      v_empresa_id,
      'Jazely Hermisilla',
      '0976565157',
      NULL,
      'jazely hermisilla'
    ),
    (
      v_empresa_id,
      'Jazmin Aguallo',
      '0986525358',
      NULL,
      'jazmin aguallo'
    ),
    (
      v_empresa_id,
      'Jazmin Aguayo',
      '0986522358',
      NULL,
      'jazmin aguayo'
    ),
    (
      v_empresa_id,
      'Jazmin Alderete',
      '0971329751',
      NULL,
      'jazmin alderete'
    ),
    (
      v_empresa_id,
      'Jazmin Benitez',
      '0961816177',
      '2 selos (2)',
      'jazmin benitez'
    ),
    (
      v_empresa_id,
      'Jazmin Cespedes',
      '0971554856',
      '10mil',
      'jazmin cespedes'
    ),
    (
      v_empresa_id,
      'Jazmin Escurra',
      '0984864458',
      NULL,
      'jazmin escurra'
    ),
    (
      v_empresa_id,
      'Jazmin Galarza',
      '0993372958',
      NULL,
      'jazmin galarza'
    ),
    (
      v_empresa_id,
      'Jazmin Galeano',
      '0976202710',
      '10MIL',
      'jazmin galeano'
    ),
    (
      v_empresa_id,
      'Jazmin Gavilan',
      '0986715812',
      NULL,
      'jazmin gavilan'
    ),
    (
      v_empresa_id,
      'Jazmin Gimenez',
      '0994847558',
      NULL,
      'jazmin gimenez'
    ),
    (
      v_empresa_id,
      'Jazmin Gomez',
      '0981594528',
      NULL,
      'jazmin gomez'
    ),
    (
      v_empresa_id,
      'Jazmin Halke',
      '0983026966',
      NULL,
      'jazmin halke'
    ),
    (
      v_empresa_id,
      'Jazmin Hamuy',
      '0983484705',
      NULL,
      'jazmin hamuy'
    ),
    (
      v_empresa_id,
      'Jazmin Jara',
      '0992933960',
      '10mil',
      'jazmin jara'
    ),
    (
      v_empresa_id,
      'Jazmin Lopez',
      '0981890900',
      NULL,
      'jazmin lopez'
    ),
    (
      v_empresa_id,
      'Jazmin Maschio',
      '0985639841',
      '30MIL',
      'jazmin maschio'
    ),
    (
      v_empresa_id,
      'Jazmin Mercado',
      '0994765740',
      NULL,
      'jazmin mercado'
    ),
    (
      v_empresa_id,
      'Jazmin Modesto',
      '0981201658',
      NULL,
      'jazmin modesto'
    ),
    (
      v_empresa_id,
      'Jazmin Mongelos',
      '0983842488',
      NULL,
      'jazmin mongelos'
    ),
    (
      v_empresa_id,
      'Jazmin Moreira',
      '0982724432',
      NULL,
      'jazmin moreira'
    ),
    (
      v_empresa_id,
      'Jazmin Ortiz',
      '0992223645',
      NULL,
      'jazmin ortiz'
    ),
    (
      v_empresa_id,
      'Jazmin Ramirez',
      '9982816947',
      NULL,
      'jazmin ramirez'
    ),
    (
      v_empresa_id,
      'Jazmin Reyes',
      '0971282140',
      NULL,
      'jazmin reyes'
    ),
    (
      v_empresa_id,
      'Jazmin Riveros',
      '0983806732',
      NULL,
      'jazmin riveros'
    ),
    (
      v_empresa_id,
      'Jazmin Rodriguez',
      '0992435339',
      NULL,
      'jazmin rodriguez'
    ),
    (
      v_empresa_id,
      'Jazmin Saldivar',
      '0986492166',
      NULL,
      'jazmin saldivar'
    ),
    (
      v_empresa_id,
      'Jazmin Sanabria',
      '0982288611',
      NULL,
      'jazmin sanabria'
    ),
    (
      v_empresa_id,
      'Jazmin Sanzo',
      '0986543254',
      NULL,
      'jazmin sanzo'
    ),
    (
      v_empresa_id,
      'Jazmin Scavenius',
      '0984212732',
      '1 selo (1)',
      'jazmin scavenius'
    ),
    (
      v_empresa_id,
      'Jazmin Torres',
      '0971778573',
      NULL,
      'jazmin torres'
    ),
    (
      v_empresa_id,
      'Jazmin Villalba',
      '0985200736',
      NULL,
      'jazmin villalba'
    ),
    (
      v_empresa_id,
      'Jegaldin Vega',
      '0972593151',
      NULL,
      'jegaldin vega'
    ),
    (
      v_empresa_id,
      'Jeidi Villalba',
      '0991712589',
      NULL,
      'jeidi villalba'
    ),
    (
      v_empresa_id,
      'Jemima Barrios',
      '0971316253',
      '1 selo (2)',
      'jemima barrios'
    ),
    (
      v_empresa_id,
      'Jemima Canhete',
      '0991692352',
      NULL,
      'jemima canhete'
    ),
    (
      v_empresa_id,
      'Jemina Rojas',
      '0985573939',
      NULL,
      'jemina rojas'
    ),
    (
      v_empresa_id,
      'Jeminne Spagnolo',
      '0972413166',
      NULL,
      'jeminne spagnolo'
    ),
    (
      v_empresa_id,
      'Jeni Miranda',
      '0981961145',
      NULL,
      'jeni miranda'
    ),
    (
      v_empresa_id,
      'Jeni Rodriguez',
      '0984514750',
      NULL,
      'jeni rodriguez'
    ),
    (
      v_empresa_id,
      'Jenifer Britez',
      '0982744732',
      NULL,
      'jenifer britez'
    ),
    (
      v_empresa_id,
      'Jenifer Camarro',
      '0976935926',
      NULL,
      'jenifer camarro'
    ),
    (
      v_empresa_id,
      'Jenifer Esquibel',
      '0981162297',
      NULL,
      'jenifer esquibel'
    ),
    (
      v_empresa_id,
      'Jenifer Giesbrecht',
      '0984139370',
      NULL,
      'jenifer giesbrecht'
    ),
    (
      v_empresa_id,
      'Jenifer Lopez',
      '0972455395',
      NULL,
      'jenifer lopez'
    ),
    (
      v_empresa_id,
      'Jenifer Rivas',
      '0983465082',
      NULL,
      'jenifer rivas'
    ),
    (
      v_empresa_id,
      'Jenifer Uyon',
      '0984359350',
      NULL,
      'jenifer uyon'
    ),
    (
      v_empresa_id,
      'Jenifer Viana',
      '0986580804',
      NULL,
      'jenifer viana'
    ),
    (
      v_empresa_id,
      'Jeniffer Lopez',
      '0961886190',
      NULL,
      'jeniffer lopez'
    ),
    (
      v_empresa_id,
      'Jeniffer Wolf',
      '0982676042',
      NULL,
      'jeniffer wolf'
    ),
    (
      v_empresa_id,
      'Jenni Snaguina',
      '0993410050',
      NULL,
      'jenni snaguina'
    ),
    (
      v_empresa_id,
      'Jennifer Heyn',
      '0961323165',
      NULL,
      'jennifer heyn'
    ),
    (
      v_empresa_id,
      'Jenny Bonett',
      '0981287345',
      '30mil+10mil',
      'jenny bonett'
    ),
    (
      v_empresa_id,
      'Jenny Driedger',
      '0971449699',
      NULL,
      'jenny driedger'
    ),
    (
      v_empresa_id,
      'jenny Sakamato',
      '0982885890',
      NULL,
      'jenny sakamato'
    ),
    (
      v_empresa_id,
      'Jennyfer Henrique',
      '0984365548',
      NULL,
      'jennyfer henrique'
    ),
    (
      v_empresa_id,
      'Jeny Miltos',
      '0981746441',
      NULL,
      'jeny miltos'
    ),
    (
      v_empresa_id,
      'Jeraldine Patino',
      '0976223659',
      NULL,
      'jeraldine patino'
    ),
    (
      v_empresa_id,
      'Jeremias Baez',
      '0976632419',
      NULL,
      'jeremias baez'
    ),
    (
      v_empresa_id,
      'Jesica De Arce',
      '0994988359',
      NULL,
      'jesica de arce'
    ),
    (
      v_empresa_id,
      'Jesica Diaz',
      '0982860204',
      NULL,
      'jesica diaz'
    ),
    (
      v_empresa_id,
      'Jessenia Acosta',
      '0971948969',
      NULL,
      'jessenia acosta'
    ),
    (
      v_empresa_id,
      'Jessica Alonso',
      '0991869077',
      NULL,
      'jessica alonso'
    ),
    (
      v_empresa_id,
      'Jessica Alvarez',
      '0992921469',
      NULL,
      'jessica alvarez'
    ),
    (
      v_empresa_id,
      'Jessica Arevalos',
      '0982532589',
      NULL,
      'jessica arevalos'
    ),
    (
      v_empresa_id,
      'Jessica Arrua',
      '0994912146',
      NULL,
      'jessica arrua'
    ),
    (
      v_empresa_id,
      'Jessica Bargas',
      '0991279644',
      NULL,
      'jessica bargas'
    ),
    (
      v_empresa_id,
      'Jessica Beiro',
      '0981135958',
      '10mil',
      'jessica beiro'
    ),
    (
      v_empresa_id,
      'Jessica Bobadilla',
      '0992392276',
      NULL,
      'jessica bobadilla'
    ),
    (
      v_empresa_id,
      'Jessica Borja',
      '0994287052',
      NULL,
      'jessica borja'
    ),
    (
      v_empresa_id,
      'Jessica Cabanas',
      '0972407748',
      NULL,
      'jessica cabanas'
    ),
    (
      v_empresa_id,
      'Jessica Candia',
      '0973523448',
      NULL,
      'jessica candia'
    ),
    (
      v_empresa_id,
      'Jessica Cantero',
      '0981881374',
      NULL,
      'jessica cantero'
    ),
    (
      v_empresa_id,
      'Jessica Cardozo',
      '0994503520',
      NULL,
      'jessica cardozo'
    ),
    (
      v_empresa_id,
      'Jessica Castillo',
      '0992246701',
      NULL,
      'jessica castillo'
    ),
    (
      v_empresa_id,
      'Jessica Catillo',
      NULL,
      NULL,
      'jessica catillo'
    ),
    (
      v_empresa_id,
      'Jessica Chavez',
      '0983125465',
      NULL,
      'jessica chavez'
    ),
    (
      v_empresa_id,
      'Jessica Curre',
      '0994603659',
      '10mil',
      'jessica curre'
    ),
    (
      v_empresa_id,
      'Jessica Curril',
      '0994603659',
      NULL,
      'jessica curril'
    ),
    (
      v_empresa_id,
      'Jessica Duarte',
      '0972246533',
      NULL,
      'jessica duarte'
    ),
    (
      v_empresa_id,
      'Jessica Escobar',
      '0991874699',
      '1 selo (1)',
      'jessica escobar'
    ),
    (
      v_empresa_id,
      'Jessica Ferreira',
      '0992288902',
      NULL,
      'jessica ferreira'
    ),
    (
      v_empresa_id,
      'Jessica Fleitas',
      '0984514019',
      NULL,
      'jessica fleitas'
    ),
    (
      v_empresa_id,
      'Jessica Franco',
      '0985326188',
      NULL,
      'jessica franco'
    ),
    (
      v_empresa_id,
      'Jessica Galeano',
      '0971646176',
      NULL,
      'jessica galeano'
    ),
    (
      v_empresa_id,
      'Jessica Gill',
      '0981774823',
      '10mil',
      'jessica gill'
    ),
    (
      v_empresa_id,
      'Jessica Godoy',
      '0994105472',
      '20mil',
      'jessica godoy'
    ),
    (
      v_empresa_id,
      'Jessica Gomez',
      '0986894425',
      '10mil',
      'jessica gomez'
    ),
    (
      v_empresa_id,
      'Jessica Gonzalez',
      '0971987817',
      '1 SELLO',
      'jessica gonzalez'
    ),
    (
      v_empresa_id,
      'Jessica Leguizamon',
      '0982980745',
      '40MIL',
      'jessica leguizamon'
    ),
    (
      v_empresa_id,
      'Jessica Leon',
      '0985608005',
      NULL,
      'jessica leon'
    ),
    (
      v_empresa_id,
      'Jessica Medina',
      '0983506291',
      NULL,
      'jessica medina'
    ),
    (
      v_empresa_id,
      'Jessica Monjelos',
      '0991935298',
      NULL,
      'jessica monjelos'
    ),
    (
      v_empresa_id,
      'Jessica Nizza',
      '0981977655',
      '1 selo (2)',
      'jessica nizza'
    ),
    (
      v_empresa_id,
      'Jessica Noguera',
      '0986576155',
      NULL,
      'jessica noguera'
    ),
    (
      v_empresa_id,
      'Jessica Nunez',
      '0981633680',
      NULL,
      'jessica nunez'
    ),
    (
      v_empresa_id,
      'Jessica Ocampos',
      '0986269964',
      '30MIL',
      'jessica ocampos'
    ),
    (
      v_empresa_id,
      'Jessica Omarin',
      '0985580260',
      NULL,
      'jessica omarin'
    ),
    (
      v_empresa_id,
      'Jessica Ortigoza',
      '0992991275',
      '10mil',
      'jessica ortigoza'
    ),
    (
      v_empresa_id,
      'Jessica Orue',
      '0985102663',
      '10MIL',
      'jessica orue'
    ),
    (
      v_empresa_id,
      'Jessica Padovan',
      '0981996321',
      NULL,
      'jessica padovan'
    ),
    (
      v_empresa_id,
      'Jessica PInanex',
      '0992482682',
      NULL,
      'jessica pinanex'
    ),
    (
      v_empresa_id,
      'Jessica Rios',
      '0995623543',
      NULL,
      'jessica rios'
    ),
    (
      v_empresa_id,
      'Jessica Riquelme',
      '0985397313',
      NULL,
      'jessica riquelme'
    ),
    (
      v_empresa_id,
      'Jessica Rotela',
      '0982787722',
      NULL,
      'jessica rotela'
    ),
    (
      v_empresa_id,
      'Jessica Samaniego',
      '0994117904',
      NULL,
      'jessica samaniego'
    ),
    (
      v_empresa_id,
      'Jessica Santos Horacio',
      '0992424202',
      '1 selo (1)',
      'jessica santos horacio'
    ),
    (
      v_empresa_id,
      'Jessica Segovia',
      '0994264355',
      '20mil',
      'jessica segovia'
    ),
    (
      v_empresa_id,
      'Jessica Stefanni',
      '0992710645',
      NULL,
      'jessica stefanni'
    ),
    (
      v_empresa_id,
      'Jessica Tiede',
      '0971734433',
      NULL,
      'jessica tiede'
    ),
    (
      v_empresa_id,
      'Jessica Vega',
      '0984782603',
      NULL,
      'jessica vega'
    ),
    (
      v_empresa_id,
      'Jessica Villalba',
      '0983241579',
      '10mil',
      'jessica villalba'
    ),
    (
      v_empresa_id,
      'Jessica Voth',
      '0985900468',
      NULL,
      'jessica voth'
    ),
    (
      v_empresa_id,
      'Jessica Zarate',
      '0981455012',
      '1 saelo (1)',
      'jessica zarate'
    ),
    (
      v_empresa_id,
      'Jessy stewart',
      '0981453222',
      NULL,
      'jessy stewart'
    ),
    (
      v_empresa_id,
      'Jessyca Averio',
      '0992927863',
      NULL,
      'jessyca averio'
    ),
    (
      v_empresa_id,
      'Jessyca Bengoechea',
      '0982132521',
      NULL,
      'jessyca bengoechea'
    ),
    (
      v_empresa_id,
      'Jessyca Casco',
      '0982211122',
      NULL,
      'jessyca casco'
    ),
    (
      v_empresa_id,
      'Jessyca Escobar',
      '0981114325',
      NULL,
      'jessyca escobar'
    ),
    (
      v_empresa_id,
      'Jessyca Servin',
      '0972458210',
      NULL,
      'jessyca servin'
    ),
    (
      v_empresa_id,
      'Jesus Araujo',
      '0985339176',
      NULL,
      'jesus araujo'
    ),
    (
      v_empresa_id,
      'Jesus Barreto',
      '0984894570',
      NULL,
      'jesus barreto'
    ),
    (
      v_empresa_id,
      'Jesus Caceres',
      '0991470469',
      NULL,
      'jesus caceres'
    ),
    (
      v_empresa_id,
      'Jesus Candia',
      '0982992680',
      NULL,
      'jesus candia'
    ),
    (
      v_empresa_id,
      'Jesus Vera',
      '0983501998',
      '10mil',
      'jesus vera'
    ),
    (
      v_empresa_id,
      'Jhemima Canete',
      '0991692352',
      NULL,
      'jhemima canete'
    ),
    (
      v_empresa_id,
      'Jimena Acosta',
      '0985165603',
      NULL,
      'jimena acosta'
    ),
    (
      v_empresa_id,
      'Jimena Adorno',
      '0981127791',
      NULL,
      'jimena adorno'
    ),
    (
      v_empresa_id,
      'Jimena Araujo',
      '0981127791',
      '10MIL',
      'jimena araujo'
    ),
    (
      v_empresa_id,
      'Jimena Cabanhas',
      '0983060159',
      NULL,
      'jimena cabanhas'
    ),
    (
      v_empresa_id,
      'Jimena Ferreira',
      '0992566253',
      '10mil',
      'jimena ferreira'
    ),
    (
      v_empresa_id,
      'Jimena Fretes',
      '0981207210',
      NULL,
      'jimena fretes'
    ),
    (
      v_empresa_id,
      'Jimena Galeano',
      '0991329151',
      NULL,
      'jimena galeano'
    ),
    (
      v_empresa_id,
      'Jimena Lugo',
      '0991631010',
      NULL,
      'jimena lugo'
    ),
    (
      v_empresa_id,
      'Jimena Nequi',
      '0984524112',
      NULL,
      'jimena nequi'
    ),
    (
      v_empresa_id,
      'Jimena Rodriguez',
      '0993572646',
      NULL,
      'jimena rodriguez'
    ),
    (
      v_empresa_id,
      'Joaquin Ferreira',
      '0985412862',
      NULL,
      'joaquin ferreira'
    ),
    (
      v_empresa_id,
      'Joel Bogado',
      '0991183240',
      NULL,
      'joel bogado'
    ),
    (
      v_empresa_id,
      'Joel Sutton',
      '0981767550',
      NULL,
      'joel sutton'
    ),
    (
      v_empresa_id,
      'Joha',
      '0982182031',
      '30mil',
      'joha'
    ),
    (
      v_empresa_id,
      'Johana Bareiro',
      '0992381807',
      NULL,
      'johana bareiro'
    ),
    (
      v_empresa_id,
      'Johana Benitez',
      '0982344019',
      NULL,
      'johana benitez'
    ),
    (
      v_empresa_id,
      'Johana Bogado',
      '0983671672',
      NULL,
      'johana bogado'
    ),
    (
      v_empresa_id,
      'Johana Cristaldo',
      '0975583191',
      NULL,
      'johana cristaldo'
    ),
    (
      v_empresa_id,
      'Johana Denis',
      '0987493125',
      NULL,
      'johana denis'
    ),
    (
      v_empresa_id,
      'Johana Doldan',
      '0981208889',
      NULL,
      'johana doldan'
    ),
    (
      v_empresa_id,
      'Johana Forte',
      '0981116209',
      '30mil',
      'johana forte'
    ),
    (
      v_empresa_id,
      'Johana Gonzalez',
      '0972430830',
      '10MIL',
      'johana gonzalez'
    ),
    (
      v_empresa_id,
      'Johana Jara',
      '0981983678',
      NULL,
      'johana jara'
    ),
    (
      v_empresa_id,
      'Johana Ledesma',
      '98550212',
      NULL,
      'johana ledesma'
    ),
    (
      v_empresa_id,
      'Johana Leiva',
      '0972729878',
      NULL,
      'johana leiva'
    ),
    (
      v_empresa_id,
      'Johana Lopez',
      '0986920624',
      NULL,
      'johana lopez'
    ),
    (
      v_empresa_id,
      'Johana Martinez',
      '0993376674',
      NULL,
      'johana martinez'
    ),
    (
      v_empresa_id,
      'Johana Mask',
      '0994341985',
      NULL,
      'johana mask'
    ),
    (
      v_empresa_id,
      'Johana Portillo',
      '0983485863',
      NULL,
      'johana portillo'
    ),
    (
      v_empresa_id,
      'Johana Recalde',
      '0981428216',
      NULL,
      'johana recalde'
    ),
    (
      v_empresa_id,
      'Johana Robledo',
      '0986514790',
      NULL,
      'johana robledo'
    ),
    (
      v_empresa_id,
      'Johana Rodas',
      '0971903983',
      NULL,
      'johana rodas'
    ),
    (
      v_empresa_id,
      'Johana Rodriguez',
      '0994868267',
      '20MIL',
      'johana rodriguez'
    ),
    (
      v_empresa_id,
      'Johana Saldivar',
      '0982814735',
      '20MIL',
      'johana saldivar'
    ),
    (
      v_empresa_id,
      'Johana Velazquez',
      '0993581236',
      '10mil',
      'johana velazquez'
    ),
    (
      v_empresa_id,
      'Johana Villanueva',
      '0994150176',
      NULL,
      'johana villanueva'
    ),
    (
      v_empresa_id,
      'Johana Wall',
      '0982699637',
      NULL,
      'johana wall'
    ),
    (
      v_empresa_id,
      'Johani Neufeld',
      '0976403853',
      NULL,
      'johani neufeld'
    ),
    (
      v_empresa_id,
      'Johanna Garcia',
      '0961600651',
      NULL,
      'johanna garcia'
    ),
    (
      v_empresa_id,
      'Johanny Vivas',
      '0973621445',
      '20mil',
      'johanny vivas'
    ),
    (
      v_empresa_id,
      'Jonatan Insfran',
      '0991695810',
      NULL,
      'jonatan insfran'
    ),
    (
      v_empresa_id,
      'Jonathan Larroza',
      '0981289974',
      NULL,
      'jonathan larroza'
    ),
    (
      v_empresa_id,
      'Jorge Aguilera',
      '0982919164',
      NULL,
      'jorge aguilera'
    ),
    (
      v_empresa_id,
      'Jorge Benitez Gutierres',
      '0981405800',
      NULL,
      'jorge benitez gutierres'
    ),
    (
      v_empresa_id,
      'Jorge Davalos',
      '0982104929',
      NULL,
      'jorge davalos'
    ),
    (
      v_empresa_id,
      'Jorge Fernandez',
      '0972607208',
      '20mil',
      'jorge fernandez'
    ),
    (
      v_empresa_id,
      'Jorge Godoy',
      '0984531820',
      NULL,
      'jorge godoy'
    ),
    (
      v_empresa_id,
      'Jorge Inciarte',
      '0986276269',
      '10mil',
      'jorge inciarte'
    ),
    (
      v_empresa_id,
      'Jorge Lopez',
      '0994352881',
      NULL,
      'jorge lopez'
    ),
    (
      v_empresa_id,
      'Jorge Vallejos',
      '0981354101',
      NULL,
      'jorge vallejos'
    ),
    (
      v_empresa_id,
      'Jorge Villalba',
      '9871428990',
      NULL,
      'jorge villalba'
    ),
    (
      v_empresa_id,
      'Jorgue Saucedo',
      '0983814406',
      NULL,
      'jorgue saucedo'
    ),
    (
      v_empresa_id,
      'Jose Amarilla',
      '0985997782',
      NULL,
      'jose amarilla'
    ),
    (
      v_empresa_id,
      'Jose Bobadilla',
      '0975362117',
      NULL,
      'jose bobadilla'
    ),
    (
      v_empresa_id,
      'Jose Britez',
      '0994282435',
      NULL,
      'jose britez'
    ),
    (
      v_empresa_id,
      'Jose Caceres',
      '0981305812',
      NULL,
      'jose caceres'
    ),
    (
      v_empresa_id,
      'Jose Contrera',
      '0971976760',
      NULL,
      'jose contrera'
    ),
    (
      v_empresa_id,
      'Jose Dure',
      '0981228580',
      '10mil',
      'jose dure'
    ),
    (
      v_empresa_id,
      'Jose Lesme',
      '0981908933',
      '1 selo (6)',
      'jose lesme'
    ),
    (
      v_empresa_id,
      'Jose Lodopacher',
      '0981697183',
      NULL,
      'jose lodopacher'
    ),
    (
      v_empresa_id,
      'Jose Maujes',
      '0981973400',
      '10mil',
      'jose maujes'
    ),
    (
      v_empresa_id,
      'Jose Mendoza',
      '0981132811',
      NULL,
      'jose mendoza'
    ),
    (
      v_empresa_id,
      'Jose Miranda',
      '0973448603',
      NULL,
      'jose miranda'
    ),
    (
      v_empresa_id,
      'Jose Mura',
      '0982262480',
      NULL,
      'jose mura'
    ),
    (
      v_empresa_id,
      'Jose Paiva',
      '0985717962',
      NULL,
      'jose paiva'
    ),
    (
      v_empresa_id,
      'Jose Pereira',
      '0983994095',
      NULL,
      'jose pereira'
    ),
    (
      v_empresa_id,
      'Jose Rigueredo',
      '0983356371',
      NULL,
      'jose rigueredo'
    ),
    (
      v_empresa_id,
      'Jose Salas',
      '9872443668',
      NULL,
      'jose salas'
    ),
    (
      v_empresa_id,
      'Jose Samaniego',
      '0961831964',
      NULL,
      'jose samaniego'
    ),
    (
      v_empresa_id,
      'Jose Sanchez',
      '0992900472',
      NULL,
      'jose sanchez'
    ),
    (
      v_empresa_id,
      'Jose Sceura',
      '0994396769',
      NULL,
      'jose sceura'
    ),
    (
      v_empresa_id,
      'Jose Sojo',
      '0993309532',
      NULL,
      'jose sojo'
    ),
    (
      v_empresa_id,
      'Jose Torres',
      '0992443503',
      NULL,
      'jose torres'
    ),
    (
      v_empresa_id,
      'Joselin Blanco',
      '0991654125',
      NULL,
      'joselin blanco'
    ),
    (
      v_empresa_id,
      'Josep Estanlei',
      NULL,
      NULL,
      'josep estanlei'
    ),
    (
      v_empresa_id,
      'Jovana Barchelo',
      '0986176797',
      '1 selo (1)',
      'jovana barchelo'
    ),
    (
      v_empresa_id,
      'Juan Bogarin',
      '0981773648',
      '10mil',
      'juan bogarin'
    ),
    (
      v_empresa_id,
      'Juan Calcena',
      '0981289697',
      NULL,
      'juan calcena'
    ),
    (
      v_empresa_id,
      'Juan Cantero',
      '0985300709',
      NULL,
      'juan cantero'
    ),
    (
      v_empresa_id,
      'Juan Carlos Ramirez',
      '0992682593',
      NULL,
      'juan carlos ramirez'
    ),
    (
      v_empresa_id,
      'Juan Diaz',
      '0983448747',
      NULL,
      'juan diaz'
    ),
    (
      v_empresa_id,
      'Juan Godoy',
      '0983454177',
      NULL,
      'juan godoy'
    ),
    (
      v_empresa_id,
      'Juan Irrafabala',
      '0972164035',
      '10mil',
      'juan irrafabala'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 6: filas 2501..3000
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Juan Ovelar',
      '0971719593',
      NULL,
      'juan ovelar'
    ),
    (
      v_empresa_id,
      'Juan Pablo Ortiz',
      '0991220709',
      NULL,
      'juan pablo ortiz'
    ),
    (
      v_empresa_id,
      'Juan Santacruz',
      '0983542196',
      NULL,
      'juan santacruz'
    ),
    (
      v_empresa_id,
      'Juan Sosa',
      '0994768013',
      '10mil',
      'juan sosa'
    ),
    (
      v_empresa_id,
      'Juan Torales',
      '0983906312',
      '30mil',
      'juan torales'
    ),
    (
      v_empresa_id,
      'Juan Verdun',
      '0994503053',
      NULL,
      'juan verdun'
    ),
    (
      v_empresa_id,
      'Juana Amarilla',
      '0982919332',
      NULL,
      'juana amarilla'
    ),
    (
      v_empresa_id,
      'Juana Davalos',
      '0984777236',
      NULL,
      'juana davalos'
    ),
    (
      v_empresa_id,
      'Judit Jimenez',
      '0992912786',
      NULL,
      'judit jimenez'
    ),
    (
      v_empresa_id,
      'Judith Roura',
      '0992287562',
      NULL,
      'judith roura'
    ),
    (
      v_empresa_id,
      'Judith Torales',
      '0981442962',
      '1 selo (9)',
      'judith torales'
    ),
    (
      v_empresa_id,
      'juguetitos',
      NULL,
      NULL,
      'juguetitos'
    ),
    (
      v_empresa_id,
      'Julia Barrios',
      '0985857248',
      NULL,
      'julia barrios'
    ),
    (
      v_empresa_id,
      'Julia Cabrera',
      '0972438792',
      NULL,
      'julia cabrera'
    ),
    (
      v_empresa_id,
      'Julia Curtido',
      '0982390198',
      NULL,
      'julia curtido'
    ),
    (
      v_empresa_id,
      'Julia Gonzalez',
      '0984732995',
      NULL,
      'julia gonzalez'
    ),
    (
      v_empresa_id,
      'Julia Paredes',
      '0983890444',
      NULL,
      'julia paredes'
    ),
    (
      v_empresa_id,
      'Julia Santos',
      '0991712490',
      NULL,
      'julia santos'
    ),
    (
      v_empresa_id,
      'Julian Lugon',
      '0992205452',
      NULL,
      'julian lugon'
    ),
    (
      v_empresa_id,
      'Julian Nunez',
      '0986550894',
      NULL,
      'julian nunez'
    ),
    (
      v_empresa_id,
      'Julian Palacios',
      '0982829498',
      NULL,
      'julian palacios'
    ),
    (
      v_empresa_id,
      'Juliana Barrios',
      '0973561166',
      NULL,
      'juliana barrios'
    ),
    (
      v_empresa_id,
      'Juliana Benitez',
      '0983560329',
      NULL,
      'juliana benitez'
    ),
    (
      v_empresa_id,
      'Juliana Cantero',
      '0976659908',
      NULL,
      'juliana cantero'
    ),
    (
      v_empresa_id,
      'Juliana Mercado',
      '0972964187',
      NULL,
      'juliana mercado'
    ),
    (
      v_empresa_id,
      'Juliana Tsutsumi',
      NULL,
      NULL,
      'juliana tsutsumi'
    ),
    (
      v_empresa_id,
      'Julieta Rosini',
      '0982200767',
      NULL,
      'julieta rosini'
    ),
    (
      v_empresa_id,
      'Julieta Rossini',
      '0982200767',
      NULL,
      'julieta rossini'
    ),
    (
      v_empresa_id,
      'Julieta Villasboa',
      '0972126306',
      NULL,
      'julieta villasboa'
    ),
    (
      v_empresa_id,
      'Julio Arguello',
      '0982563416',
      NULL,
      'julio arguello'
    ),
    (
      v_empresa_id,
      'Julio Benitez',
      '0986720386',
      NULL,
      'julio benitez'
    ),
    (
      v_empresa_id,
      'Julio Ferreira',
      '0987297196',
      NULL,
      'julio ferreira'
    ),
    (
      v_empresa_id,
      'Jusue Villalba',
      '0981803692',
      NULL,
      'jusue villalba'
    ),
    (
      v_empresa_id,
      'Kaeyla Sosa',
      '0981417093',
      NULL,
      'kaeyla sosa'
    ),
    (
      v_empresa_id,
      'Kaherine Peyoda',
      '0983760654',
      NULL,
      'kaherine peyoda'
    ),
    (
      v_empresa_id,
      'Kamamia',
      NULL,
      NULL,
      'kamamia'
    ),
    (
      v_empresa_id,
      'Kamamya',
      NULL,
      NULL,
      'kamamya'
    ),
    (
      v_empresa_id,
      'Kamamya conjuntos frio',
      NULL,
      NULL,
      'kamamya conjuntos frio'
    ),
    (
      v_empresa_id,
      'Kamamya MASSSS',
      NULL,
      NULL,
      'kamamya massss'
    ),
    (
      v_empresa_id,
      'Karen Arca',
      '0982291820',
      NULL,
      'karen arca'
    ),
    (
      v_empresa_id,
      'Karen Arce',
      '0984549877',
      '1 selo (1)',
      'karen arce'
    ),
    (
      v_empresa_id,
      'Karen Barrios',
      '0992924393',
      NULL,
      'karen barrios'
    ),
    (
      v_empresa_id,
      'Karen Cabrera',
      '0994846489',
      NULL,
      'karen cabrera'
    ),
    (
      v_empresa_id,
      'Karen Delacruz',
      '0971746568',
      NULL,
      'karen delacruz'
    ),
    (
      v_empresa_id,
      'Karen Diaz',
      '0981731959',
      NULL,
      'karen diaz'
    ),
    (
      v_empresa_id,
      'Karen Fernandez',
      '0986301111',
      NULL,
      'karen fernandez'
    ),
    (
      v_empresa_id,
      'Karen Figueredo',
      '0984484921',
      NULL,
      'karen figueredo'
    ),
    (
      v_empresa_id,
      'Karen Forster',
      '0981571918',
      NULL,
      'karen forster'
    ),
    (
      v_empresa_id,
      'Karen Gaona',
      '0981110453',
      '39mil',
      'karen gaona'
    ),
    (
      v_empresa_id,
      'Karen Garcete',
      '0981767727',
      NULL,
      'karen garcete'
    ),
    (
      v_empresa_id,
      'Karen Gimenez',
      '0976565151',
      NULL,
      'karen gimenez'
    ),
    (
      v_empresa_id,
      'Karen Gonzalez',
      '0986185375',
      '10mil',
      'karen gonzalez'
    ),
    (
      v_empresa_id,
      'Karen Idoyaga',
      '0982220692',
      NULL,
      'karen idoyaga'
    ),
    (
      v_empresa_id,
      'Karen Jara',
      '0985650388',
      '1 selo (1)',
      'karen jara'
    ),
    (
      v_empresa_id,
      'Karen Jimenez',
      '0986231028',
      NULL,
      'karen jimenez'
    ),
    (
      v_empresa_id,
      'Karen Maldonado',
      '0991653070',
      NULL,
      'karen maldonado'
    ),
    (
      v_empresa_id,
      'Karen Mora',
      '0991831585',
      NULL,
      'karen mora'
    ),
    (
      v_empresa_id,
      'Karen Noguera',
      '0983477286',
      NULL,
      'karen noguera'
    ),
    (
      v_empresa_id,
      'Karen Nunez',
      '0994452625',
      NULL,
      'karen nunez'
    ),
    (
      v_empresa_id,
      'Karen Paredes',
      '0983714652',
      NULL,
      'karen paredes'
    ),
    (
      v_empresa_id,
      'Karen Parini',
      '0981601427',
      NULL,
      'karen parini'
    ),
    (
      v_empresa_id,
      'Karen Pestano',
      '0991374931',
      '1selo (1)',
      'karen pestano'
    ),
    (
      v_empresa_id,
      'Karen Prieto',
      '0972782721',
      NULL,
      'karen prieto'
    ),
    (
      v_empresa_id,
      'Karen Salinas',
      '0986734611',
      NULL,
      'karen salinas'
    ),
    (
      v_empresa_id,
      'Karen Vazquez',
      '0994235208',
      NULL,
      'karen vazquez'
    ),
    (
      v_empresa_id,
      'Karenia da silva',
      '0994988408',
      NULL,
      'karenia da silva'
    ),
    (
      v_empresa_id,
      'Karin Canete',
      '0983821872',
      NULL,
      'karin canete'
    ),
    (
      v_empresa_id,
      'Karin Fernandez',
      '0983142310',
      NULL,
      'karin fernandez'
    ),
    (
      v_empresa_id,
      'Karin Juilfs',
      '0985172430',
      NULL,
      'karin juilfs'
    ),
    (
      v_empresa_id,
      'Karin Mesa',
      '0991864980',
      NULL,
      'karin mesa'
    ),
    (
      v_empresa_id,
      'Karin Meza',
      '0991864980',
      NULL,
      'karin meza'
    ),
    (
      v_empresa_id,
      'Karina aquino',
      '0971147422',
      '20mil',
      'karina aquino'
    ),
    (
      v_empresa_id,
      'Karina Areco',
      '0981521654',
      NULL,
      'karina areco'
    ),
    (
      v_empresa_id,
      'Karina Benitez',
      '0971923649',
      NULL,
      'karina benitez'
    ),
    (
      v_empresa_id,
      'Karina Cabrera',
      '0972239862',
      NULL,
      'karina cabrera'
    ),
    (
      v_empresa_id,
      'Karina Canclini',
      '0961933876',
      NULL,
      'karina canclini'
    ),
    (
      v_empresa_id,
      'Karina Cardozo',
      '0983954855',
      NULL,
      'karina cardozo'
    ),
    (
      v_empresa_id,
      'Karina Dominguez',
      '9986782257',
      NULL,
      'karina dominguez'
    ),
    (
      v_empresa_id,
      'Karina Koumin',
      '0981266795',
      NULL,
      'karina koumin'
    ),
    (
      v_empresa_id,
      'Karina Leiva',
      '0983406888',
      '30mii',
      'karina leiva'
    ),
    (
      v_empresa_id,
      'Karina Lopez',
      '0971909002',
      NULL,
      'karina lopez'
    ),
    (
      v_empresa_id,
      'Karina Maldonado',
      '0984758652',
      '20mil',
      'karina maldonado'
    ),
    (
      v_empresa_id,
      'Karina Martines',
      '0983896966',
      NULL,
      'karina martines'
    ),
    (
      v_empresa_id,
      'Karina Martinez',
      '0981594666',
      NULL,
      'karina martinez'
    ),
    (
      v_empresa_id,
      'Karina Narvaez',
      '0981151083',
      NULL,
      'karina narvaez'
    ),
    (
      v_empresa_id,
      'Karina Rodriguez',
      '0985464056',
      '30mil',
      'karina rodriguez'
    ),
    (
      v_empresa_id,
      'Karina Rolon',
      '0981568454',
      NULL,
      'karina rolon'
    ),
    (
      v_empresa_id,
      'Karina Roman',
      '0985284667',
      NULL,
      'karina roman'
    ),
    (
      v_empresa_id,
      'Karina Rosa',
      '0961469766',
      NULL,
      'karina rosa'
    ),
    (
      v_empresa_id,
      'Karina Salinas',
      '0994863580',
      NULL,
      'karina salinas'
    ),
    (
      v_empresa_id,
      'Karina Samudio',
      '0981678352',
      '10MIL',
      'karina samudio'
    ),
    (
      v_empresa_id,
      'Karina Silva',
      '0981238293',
      NULL,
      'karina silva'
    ),
    (
      v_empresa_id,
      'Karine Flores de Caumpos',
      '5545991225148',
      NULL,
      'karine flores de caumpos'
    ),
    (
      v_empresa_id,
      'Karla Penayo',
      '0982160641',
      NULL,
      'karla penayo'
    ),
    (
      v_empresa_id,
      'Karla Ramirez',
      '0984722661',
      NULL,
      'karla ramirez'
    ),
    (
      v_empresa_id,
      'Karmen Martinez',
      '0981429863',
      NULL,
      'karmen martinez'
    ),
    (
      v_empresa_id,
      'Karolina Vera',
      '0981130332',
      NULL,
      'karolina vera'
    ),
    (
      v_empresa_id,
      'Katerin Caballero',
      '0972652830',
      NULL,
      'katerin caballero'
    ),
    (
      v_empresa_id,
      'Katerin Delgado',
      '0991874995',
      NULL,
      'katerin delgado'
    ),
    (
      v_empresa_id,
      'Katerin Mendez',
      '0993540734',
      '10mil',
      'katerin mendez'
    ),
    (
      v_empresa_id,
      'Katerin Paredes',
      '0981612212',
      NULL,
      'katerin paredes'
    ),
    (
      v_empresa_id,
      'Katerin Romero',
      '0982988722',
      NULL,
      'katerin romero'
    ),
    (
      v_empresa_id,
      'Katerine Mendez',
      '0993540734',
      NULL,
      'katerine mendez'
    ),
    (
      v_empresa_id,
      'Kathe Sanabria',
      '0981154312',
      NULL,
      'kathe sanabria'
    ),
    (
      v_empresa_id,
      'Katherin Peralta',
      '0976188199',
      NULL,
      'katherin peralta'
    ),
    (
      v_empresa_id,
      'Katherin Pereira',
      '0984849906',
      NULL,
      'katherin pereira'
    ),
    (
      v_empresa_id,
      'Katherin Schachtebeck',
      '0971970880',
      NULL,
      'katherin schachtebeck'
    ),
    (
      v_empresa_id,
      'Katherin Wright',
      '0992267187',
      NULL,
      'katherin wright'
    ),
    (
      v_empresa_id,
      'Katherin Zarate',
      '0971179202',
      NULL,
      'katherin zarate'
    ),
    (
      v_empresa_id,
      'Katherine Alvarez',
      '0992207811',
      '1 selo (3)',
      'katherine alvarez'
    ),
    (
      v_empresa_id,
      'Katherine Colman',
      '0986764401',
      NULL,
      'katherine colman'
    ),
    (
      v_empresa_id,
      'Katherine Delgado',
      '0991874995',
      NULL,
      'katherine delgado'
    ),
    (
      v_empresa_id,
      'Katherine Reichert',
      '0983317866',
      NULL,
      'katherine reichert'
    ),
    (
      v_empresa_id,
      'Katherine Riveros',
      '0985867290',
      NULL,
      'katherine riveros'
    ),
    (
      v_empresa_id,
      'Katherine Tbakman',
      '0981340771',
      NULL,
      'katherine tbakman'
    ),
    (
      v_empresa_id,
      'Kathia Ouneissi',
      '0981490513',
      NULL,
      'kathia ouneissi'
    ),
    (
      v_empresa_id,
      'Kathiana Lopez',
      '0984488416',
      NULL,
      'kathiana lopez'
    ),
    (
      v_empresa_id,
      'Kathya Corrales',
      '0983832582',
      NULL,
      'kathya corrales'
    ),
    (
      v_empresa_id,
      'Kathya Jara',
      '0981293630',
      '10MIL',
      'kathya jara'
    ),
    (
      v_empresa_id,
      'Katia Ferreira',
      '0992578858',
      '10mil',
      'katia ferreira'
    ),
    (
      v_empresa_id,
      'Katia Gimenez',
      '0986456701',
      '1 selo (1)',
      'katia gimenez'
    ),
    (
      v_empresa_id,
      'Katia Lopez',
      '0994495883',
      NULL,
      'katia lopez'
    ),
    (
      v_empresa_id,
      'Katia Pintos',
      '0991582149',
      '1 selo (1)',
      'katia pintos'
    ),
    (
      v_empresa_id,
      'Katia Riveros',
      '0981702032',
      NULL,
      'katia riveros'
    ),
    (
      v_empresa_id,
      'Katia Segovia',
      '0985911116',
      '10MIL',
      'katia segovia'
    ),
    (
      v_empresa_id,
      'Katna Gubu',
      '0994281335',
      NULL,
      'katna gubu'
    ),
    (
      v_empresa_id,
      'Katrine Lewkowitz',
      '0982383491',
      NULL,
      'katrine lewkowitz'
    ),
    (
      v_empresa_id,
      'Katty Delgado',
      '0991874995',
      NULL,
      'katty delgado'
    ),
    (
      v_empresa_id,
      'Katya Arguello',
      '0984213657',
      NULL,
      'katya arguello'
    ),
    (
      v_empresa_id,
      'Katya Carrillo',
      '0971826299',
      NULL,
      'katya carrillo'
    ),
    (
      v_empresa_id,
      'Katya Quintana',
      '0987281048',
      NULL,
      'katya quintana'
    ),
    (
      v_empresa_id,
      'Keatri Kin',
      '0991755667',
      NULL,
      'keatri kin'
    ),
    (
      v_empresa_id,
      'Keila Prieto',
      NULL,
      NULL,
      'keila prieto'
    ),
    (
      v_empresa_id,
      'kem kem',
      NULL,
      NULL,
      'kem kem'
    ),
    (
      v_empresa_id,
      'Keren Lares',
      '0983554417',
      NULL,
      'keren lares'
    ),
    (
      v_empresa_id,
      'Kevin Canon',
      '0972242595',
      NULL,
      'kevin canon'
    ),
    (
      v_empresa_id,
      'Keyla Ortega',
      '0986894792',
      NULL,
      'keyla ortega'
    ),
    (
      v_empresa_id,
      'Keyla Sosa',
      '0981417093',
      NULL,
      'keyla sosa'
    ),
    (
      v_empresa_id,
      'Kiara Arce',
      '0994987808',
      NULL,
      'kiara arce'
    ),
    (
      v_empresa_id,
      'Kiara Coronel',
      '0976113915',
      NULL,
      'kiara coronel'
    ),
    (
      v_empresa_id,
      'Kiara Katzenberger',
      '0983362492',
      '1 selo (7)',
      'kiara katzenberger'
    ),
    (
      v_empresa_id,
      'Kiara lopez',
      '0991991554',
      NULL,
      'kiara lopez'
    ),
    (
      v_empresa_id,
      'Kiara Martinez',
      '0982397568',
      '20MIL',
      'kiara martinez'
    ),
    (
      v_empresa_id,
      'Kiara Portillo',
      '0981461618',
      '10MIL',
      'kiara portillo'
    ),
    (
      v_empresa_id,
      'Kiara Rijas',
      '0984545172',
      NULL,
      'kiara rijas'
    ),
    (
      v_empresa_id,
      'Kiara Rocher',
      '0985268883',
      NULL,
      'kiara rocher'
    ),
    (
      v_empresa_id,
      'Kiara Rojas',
      '0984545172',
      NULL,
      'kiara rojas'
    ),
    (
      v_empresa_id,
      'Kiara Samudio',
      '0986638641',
      NULL,
      'kiara samudio'
    ),
    (
      v_empresa_id,
      'Kiara Yudis',
      '0981600854',
      '10mil',
      'kiara yudis'
    ),
    (
      v_empresa_id,
      'kim familys',
      NULL,
      NULL,
      'kim familys'
    ),
    (
      v_empresa_id,
      'Kimberly Ramoa',
      '0986668840',
      NULL,
      'kimberly ramoa'
    ),
    (
      v_empresa_id,
      'Kimberly Romero',
      '0972194558',
      NULL,
      'kimberly romero'
    ),
    (
      v_empresa_id,
      'Kims Family',
      NULL,
      NULL,
      'kims family'
    ),
    (
      v_empresa_id,
      'Korina Vera',
      '0986581236',
      NULL,
      'korina vera'
    ),
    (
      v_empresa_id,
      'Kraguer Janina',
      '0981931509',
      NULL,
      'kraguer janina'
    ),
    (
      v_empresa_id,
      'Kristel Godoy',
      '0981606599',
      '10MIL',
      'kristel godoy'
    ),
    (
      v_empresa_id,
      'Kristhel Martinez',
      '0991475195',
      NULL,
      'kristhel martinez'
    ),
    (
      v_empresa_id,
      'Kyara Katzenberger',
      '0983362492',
      '1 selo (1)',
      'kyara katzenberger'
    ),
    (
      v_empresa_id,
      'KYMS FAMILY',
      NULL,
      NULL,
      'kyms family'
    ),
    (
      v_empresa_id,
      'la nueva juguetes',
      NULL,
      NULL,
      'la nueva juguetes'
    ),
    (
      v_empresa_id,
      'Laila Aguero',
      '0981090514',
      NULL,
      'laila aguero'
    ),
    (
      v_empresa_id,
      'Laila Aguilera',
      '0981869763',
      NULL,
      'laila aguilera'
    ),
    (
      v_empresa_id,
      'Lais Santos',
      '0991961553',
      NULL,
      'lais santos'
    ),
    (
      v_empresa_id,
      'Lara Avente',
      '0983718316',
      NULL,
      'lara avente'
    ),
    (
      v_empresa_id,
      'Lara Olmedo',
      '0983969615',
      NULL,
      'lara olmedo'
    ),
    (
      v_empresa_id,
      'Laran Sofia',
      '0981504172',
      NULL,
      'laran sofia'
    ),
    (
      v_empresa_id,
      'Larensi',
      '0972610669',
      NULL,
      'larensi'
    ),
    (
      v_empresa_id,
      'Larisa Florentin',
      '0991925296',
      NULL,
      'larisa florentin'
    ),
    (
      v_empresa_id,
      'Larisa Giana',
      '9659606978',
      '10mil',
      'larisa giana'
    ),
    (
      v_empresa_id,
      'Larisa Gomez',
      '0972414577',
      NULL,
      'larisa gomez'
    ),
    (
      v_empresa_id,
      'Larisa Leid',
      '0975864484',
      NULL,
      'larisa leid'
    ),
    (
      v_empresa_id,
      'Larisa Lopez',
      '0976127286',
      NULL,
      'larisa lopez'
    ),
    (
      v_empresa_id,
      'Larisa Medina',
      '0985803301',
      '20MIL',
      'larisa medina'
    ),
    (
      v_empresa_id,
      'Larisa Palma',
      '0981199419',
      NULL,
      'larisa palma'
    ),
    (
      v_empresa_id,
      'Larisa Reyes',
      '0986774615',
      NULL,
      'larisa reyes'
    ),
    (
      v_empresa_id,
      'Larisa Samo',
      '0981175849',
      NULL,
      'larisa samo'
    ),
    (
      v_empresa_id,
      'Larisa Yunis',
      '0985461816',
      NULL,
      'larisa yunis'
    ),
    (
      v_empresa_id,
      'LarisaYunis',
      '0985461816',
      '1 selo (1)',
      'larisayunis'
    ),
    (
      v_empresa_id,
      'Larissa Aguilar',
      '0993489090',
      NULL,
      'larissa aguilar'
    ),
    (
      v_empresa_id,
      'Larissa Amarilla',
      '0985904745',
      '10mil',
      'larissa amarilla'
    ),
    (
      v_empresa_id,
      'Larissa Cabrera',
      '0981288806',
      NULL,
      'larissa cabrera'
    ),
    (
      v_empresa_id,
      'Larissa Duck',
      '0984594542',
      NULL,
      'larissa duck'
    ),
    (
      v_empresa_id,
      'Larissa Garay',
      '0982339513',
      NULL,
      'larissa garay'
    ),
    (
      v_empresa_id,
      'Larissa Montiel',
      '0974572484',
      NULL,
      'larissa montiel'
    ),
    (
      v_empresa_id,
      'Larissa Noguera',
      '0985964442',
      NULL,
      'larissa noguera'
    ),
    (
      v_empresa_id,
      'Larissa Ortiz',
      '0984119001',
      NULL,
      'larissa ortiz'
    ),
    (
      v_empresa_id,
      'Larissa Pohl',
      '0981423545',
      NULL,
      'larissa pohl'
    ),
    (
      v_empresa_id,
      'Larissa Samo',
      '0987136039',
      NULL,
      'larissa samo'
    ),
    (
      v_empresa_id,
      'Larissa Schultz',
      NULL,
      NULL,
      'larissa schultz'
    ),
    (
      v_empresa_id,
      'Lariza Martinez',
      '0971741330',
      '10mil',
      'lariza martinez'
    ),
    (
      v_empresa_id,
      'Larizza Escobar',
      '0981890339',
      NULL,
      'larizza escobar'
    ),
    (
      v_empresa_id,
      'Laura Almada',
      '0971384373',
      NULL,
      'laura almada'
    ),
    (
      v_empresa_id,
      'Laura Alvarez',
      '0983017013',
      NULL,
      'laura alvarez'
    ),
    (
      v_empresa_id,
      'Laura Aquino',
      '0985230645',
      NULL,
      'laura aquino'
    ),
    (
      v_empresa_id,
      'Laura Araujo',
      '0991839199',
      NULL,
      'laura araujo'
    ),
    (
      v_empresa_id,
      'Laura Avalos',
      '0971108004',
      NULL,
      'laura avalos'
    ),
    (
      v_empresa_id,
      'Laura Ayala',
      '0961845726',
      NULL,
      'laura ayala'
    ),
    (
      v_empresa_id,
      'Laura Barbosa',
      '0981921272',
      NULL,
      'laura barbosa'
    ),
    (
      v_empresa_id,
      'Laura Bareiro',
      '0985917825',
      '10mil',
      'laura bareiro'
    ),
    (
      v_empresa_id,
      'Laura Benitez',
      '0981979207',
      NULL,
      'laura benitez'
    ),
    (
      v_empresa_id,
      'Laura Bobadilla',
      '0974260212',
      NULL,
      'laura bobadilla'
    ),
    (
      v_empresa_id,
      'Laura Bogado',
      '0983016477',
      NULL,
      'laura bogado'
    ),
    (
      v_empresa_id,
      'Laura Caballero',
      '0984833316',
      NULL,
      'laura caballero'
    ),
    (
      v_empresa_id,
      'Laura Cabrera',
      '0986540238',
      NULL,
      'laura cabrera'
    ),
    (
      v_empresa_id,
      'Laura Cabriz',
      '0994462833',
      NULL,
      'laura cabriz'
    ),
    (
      v_empresa_id,
      'Laura caceres',
      '0982359422',
      '1 selo',
      'laura caceres'
    ),
    (
      v_empresa_id,
      'Laura Caceres Vera',
      '0992238507',
      NULL,
      'laura caceres vera'
    ),
    (
      v_empresa_id,
      'Laura Canete',
      '0984558800',
      NULL,
      'laura canete'
    ),
    (
      v_empresa_id,
      'Laura Cantero',
      '0985107472',
      NULL,
      'laura cantero'
    ),
    (
      v_empresa_id,
      'Laura Casco',
      '0973178000',
      NULL,
      'laura casco'
    ),
    (
      v_empresa_id,
      'Laura Chavez',
      '0981381500',
      NULL,
      'laura chavez'
    ),
    (
      v_empresa_id,
      'Laura Coronel',
      '0982711252',
      NULL,
      'laura coronel'
    ),
    (
      v_empresa_id,
      'Laura Crespa',
      '0985504915',
      NULL,
      'laura crespa'
    ),
    (
      v_empresa_id,
      'Laura Diarte',
      '0991689385',
      '20mil',
      'laura diarte'
    ),
    (
      v_empresa_id,
      'Laura Duarte',
      '0971878733',
      NULL,
      'laura duarte'
    ),
    (
      v_empresa_id,
      'Laura Eddine',
      '0991910957',
      NULL,
      'laura eddine'
    ),
    (
      v_empresa_id,
      'Laura Espinola',
      '0976543730',
      '10mil',
      'laura espinola'
    ),
    (
      v_empresa_id,
      'Laura Falcon',
      '0991196553',
      NULL,
      'laura falcon'
    ),
    (
      v_empresa_id,
      'Laura Fernandez',
      '0972406872',
      NULL,
      'laura fernandez'
    ),
    (
      v_empresa_id,
      'Laura Ferreira',
      '0985132929',
      NULL,
      'laura ferreira'
    ),
    (
      v_empresa_id,
      'Laura Flores',
      '0972612474',
      NULL,
      'laura flores'
    ),
    (
      v_empresa_id,
      'Laura Galeano',
      '0981733786',
      NULL,
      'laura galeano'
    ),
    (
      v_empresa_id,
      'Laura Gamarra',
      '0985298378',
      '10mil',
      'laura gamarra'
    ),
    (
      v_empresa_id,
      'Laura Gil',
      '0981189428',
      '30MIL',
      'laura gil'
    ),
    (
      v_empresa_id,
      'Laura Gill',
      '0981189428',
      '20mil',
      'laura gill'
    ),
    (
      v_empresa_id,
      'Laura Gimenez',
      '0994356465',
      NULL,
      'laura gimenez'
    ),
    (
      v_empresa_id,
      'Laura Goiri',
      NULL,
      '1 selo (1)',
      'laura goiri'
    ),
    (
      v_empresa_id,
      'Laura Gomez',
      '0992378483',
      NULL,
      'laura gomez'
    ),
    (
      v_empresa_id,
      'Laura Gonzalez',
      '0981385024',
      NULL,
      'laura gonzalez'
    ),
    (
      v_empresa_id,
      'Laura Herrera',
      '0982692012',
      NULL,
      'laura herrera'
    ),
    (
      v_empresa_id,
      'Laura Holsbach',
      '0991341185',
      NULL,
      'laura holsbach'
    ),
    (
      v_empresa_id,
      'Laura Jara',
      '0986532021',
      '50mil',
      'laura jara'
    ),
    (
      v_empresa_id,
      'Laura Lailla',
      '0991212229',
      NULL,
      'laura lailla'
    ),
    (
      v_empresa_id,
      'Laura Leguizamon',
      '0976524337',
      NULL,
      'laura leguizamon'
    ),
    (
      v_empresa_id,
      'Laura Locatelli',
      '0983014633',
      NULL,
      'laura locatelli'
    ),
    (
      v_empresa_id,
      'Laura lodermair',
      '0983167275',
      '1 selo (2)',
      'laura lodermair'
    ),
    (
      v_empresa_id,
      'Laura Lopez',
      '0991711125',
      '10MIL',
      'laura lopez'
    ),
    (
      v_empresa_id,
      'Laura Martinez',
      '0971252390',
      NULL,
      'laura martinez'
    ),
    (
      v_empresa_id,
      'Laura Morra',
      '0981168606',
      NULL,
      'laura morra'
    ),
    (
      v_empresa_id,
      'Laura Noguera',
      '0991663773',
      NULL,
      'laura noguera'
    ),
    (
      v_empresa_id,
      'Laura Pesqin',
      '0981156795',
      NULL,
      'laura pesqin'
    ),
    (
      v_empresa_id,
      'Laura Portillo',
      '0972657233',
      NULL,
      'laura portillo'
    ),
    (
      v_empresa_id,
      'Laura Quinonez',
      '0985918258',
      NULL,
      'laura quinonez'
    ),
    (
      v_empresa_id,
      'Laura Ramirez',
      '0981839716',
      NULL,
      'laura ramirez'
    ),
    (
      v_empresa_id,
      'Laura Recalde',
      '0984741902',
      '10mil',
      'laura recalde'
    ),
    (
      v_empresa_id,
      'Laura Regunega',
      '0984491891',
      NULL,
      'laura regunega'
    ),
    (
      v_empresa_id,
      'Laura Roa',
      '0991814733',
      NULL,
      'laura roa'
    ),
    (
      v_empresa_id,
      'Laura Rodriguez',
      '0974273429',
      '10mil',
      'laura rodriguez'
    ),
    (
      v_empresa_id,
      'Laura Rojas',
      '0991750711',
      NULL,
      'laura rojas'
    ),
    (
      v_empresa_id,
      'Laura Rufener',
      '0992908635',
      NULL,
      'laura rufener'
    ),
    (
      v_empresa_id,
      'Laura Talavera',
      '0981243736',
      NULL,
      'laura talavera'
    ),
    (
      v_empresa_id,
      'Laura Torrales',
      '0986411197',
      NULL,
      'laura torrales'
    ),
    (
      v_empresa_id,
      'Laura Torres',
      '0981308997',
      NULL,
      'laura torres'
    ),
    (
      v_empresa_id,
      'Laura Velazquez',
      '0982270805',
      '1 selo (3)',
      'laura velazquez'
    ),
    (
      v_empresa_id,
      'Laura Vera',
      '0983393329',
      NULL,
      'laura vera'
    ),
    (
      v_empresa_id,
      'Laura Verdun',
      '0981964885',
      NULL,
      'laura verdun'
    ),
    (
      v_empresa_id,
      'Laura Vergara',
      '0991638686',
      NULL,
      'laura vergara'
    ),
    (
      v_empresa_id,
      'Laura Villalba',
      '0984715342',
      '10mil',
      'laura villalba'
    ),
    (
      v_empresa_id,
      'Laura Villanueva',
      '0981626928',
      NULL,
      'laura villanueva'
    ),
    (
      v_empresa_id,
      'Laura Zarate',
      '0985400352',
      NULL,
      'laura zarate'
    ),
    (
      v_empresa_id,
      'Laura Zelaya',
      '0985925362',
      NULL,
      'laura zelaya'
    ),
    (
      v_empresa_id,
      'Laura Zorrilla',
      '0991196886',
      NULL,
      'laura zorrilla'
    ),
    (
      v_empresa_id,
      'Lavado Avril',
      NULL,
      NULL,
      'lavado avril'
    ),
    (
      v_empresa_id,
      'Lavado Fer',
      NULL,
      NULL,
      'lavado fer'
    ),
    (
      v_empresa_id,
      'Lc',
      '0985825056',
      NULL,
      'lc'
    ),
    (
      v_empresa_id,
      'Le',
      NULL,
      NULL,
      'le'
    ),
    (
      v_empresa_id,
      'Lea Vera',
      '0985530171',
      NULL,
      'lea vera'
    ),
    (
      v_empresa_id,
      'Leandro Candia',
      '0992563168',
      NULL,
      'leandro candia'
    ),
    (
      v_empresa_id,
      'Leane Suderman',
      '0984444697',
      NULL,
      'leane suderman'
    ),
    (
      v_empresa_id,
      'Leda Vera',
      '0981667321',
      NULL,
      'leda vera'
    ),
    (
      v_empresa_id,
      'Lee',
      NULL,
      NULL,
      'lee'
    ),
    (
      v_empresa_id,
      'Leidy Nunez',
      '0991743342',
      NULL,
      'leidy nunez'
    ),
    (
      v_empresa_id,
      'Leidy Rojas',
      '0992473824',
      NULL,
      'leidy rojas'
    ),
    (
      v_empresa_id,
      'Leila Admen',
      '0991669870',
      '20mil',
      'leila admen'
    ),
    (
      v_empresa_id,
      'Leila Eveche',
      '0984973733',
      NULL,
      'leila eveche'
    ),
    (
      v_empresa_id,
      'Leila Figueredo',
      '0981298909',
      '10mil',
      'leila figueredo'
    ),
    (
      v_empresa_id,
      'Leila Machuca',
      '0982223363',
      NULL,
      'leila machuca'
    ),
    (
      v_empresa_id,
      'Leila Ramirez',
      '0971573733',
      NULL,
      'leila ramirez'
    ),
    (
      v_empresa_id,
      'Leila Roman Franco',
      '0971716525',
      NULL,
      'leila roman franco'
    ),
    (
      v_empresa_id,
      'Leila turi',
      '0994340425',
      NULL,
      'leila turi'
    ),
    (
      v_empresa_id,
      'Lena Penner',
      '0981724731',
      '30mil',
      'lena penner'
    ),
    (
      v_empresa_id,
      'Lenis Arau',
      '0986920009',
      '10mil',
      'lenis arau'
    ),
    (
      v_empresa_id,
      'Lenis Santacruz',
      '0986521907',
      NULL,
      'lenis santacruz'
    ),
    (
      v_empresa_id,
      'Lennis Jara',
      '0992680356',
      NULL,
      'lennis jara'
    ),
    (
      v_empresa_id,
      'Lentes',
      NULL,
      NULL,
      'lentes'
    ),
    (
      v_empresa_id,
      'Lentes cde',
      NULL,
      NULL,
      'lentes cde'
    ),
    (
      v_empresa_id,
      'lentes cerca de lyf',
      NULL,
      NULL,
      'lentes cerca de lyf'
    ),
    (
      v_empresa_id,
      'Lentes Merc',
      NULL,
      NULL,
      'lentes merc'
    ),
    (
      v_empresa_id,
      'lentes nuevos ciclistas',
      NULL,
      NULL,
      'lentes nuevos ciclistas'
    ),
    (
      v_empresa_id,
      'Lentes Tassi CDE',
      NULL,
      NULL,
      'lentes tassi cde'
    ),
    (
      v_empresa_id,
      'Lentes Tassi M4',
      NULL,
      NULL,
      'lentes tassi m4'
    ),
    (
      v_empresa_id,
      'Lenz Schroeder',
      '0971412517',
      NULL,
      'lenz schroeder'
    ),
    (
      v_empresa_id,
      'Leonardo Cantero',
      '0982284573',
      NULL,
      'leonardo cantero'
    ),
    (
      v_empresa_id,
      'Leonida Mendoza',
      '0982874039',
      NULL,
      'leonida mendoza'
    ),
    (
      v_empresa_id,
      'Leonsio Chavez',
      '0983248791',
      NULL,
      'leonsio chavez'
    ),
    (
      v_empresa_id,
      'Leryn',
      NULL,
      NULL,
      'leryn'
    ),
    (
      v_empresa_id,
      'Leslie Peason',
      NULL,
      NULL,
      'leslie peason'
    ),
    (
      v_empresa_id,
      'Lesly Pedrozo',
      '0994567228',
      NULL,
      'lesly pedrozo'
    ),
    (
      v_empresa_id,
      'Leti Rodas',
      '0975500319',
      NULL,
      'leti rodas'
    ),
    (
      v_empresa_id,
      'Letica Figueredo',
      '0986811543',
      NULL,
      'letica figueredo'
    ),
    (
      v_empresa_id,
      'Leticia',
      NULL,
      NULL,
      'leticia'
    ),
    (
      v_empresa_id,
      'Leticia Acosta',
      '0982750327',
      NULL,
      'leticia acosta'
    ),
    (
      v_empresa_id,
      'Leticia Acuna',
      '0972502080',
      NULL,
      'leticia acuna'
    ),
    (
      v_empresa_id,
      'Leticia Alderete',
      '0984612653',
      NULL,
      'leticia alderete'
    ),
    (
      v_empresa_id,
      'Leticia Almada',
      '0991364616',
      NULL,
      'leticia almada'
    ),
    (
      v_empresa_id,
      'Leticia Alonso',
      '0994645912',
      NULL,
      'leticia alonso'
    ),
    (
      v_empresa_id,
      'Leticia Aquino',
      '0976687933',
      NULL,
      'leticia aquino'
    ),
    (
      v_empresa_id,
      'Leticia Ayala',
      '0985927754',
      NULL,
      'leticia ayala'
    ),
    (
      v_empresa_id,
      'Leticia Baez',
      '0985945187',
      NULL,
      'leticia baez'
    ),
    (
      v_empresa_id,
      'Leticia Barreto',
      '0994350920',
      '10mil',
      'leticia barreto'
    ),
    (
      v_empresa_id,
      'Leticia Barua',
      '0986833739',
      NULL,
      'leticia barua'
    ),
    (
      v_empresa_id,
      'Leticia Benitez',
      '0982318766',
      '20MIL',
      'leticia benitez'
    ),
    (
      v_empresa_id,
      'Leticia Bravo',
      '0994401801',
      NULL,
      'leticia bravo'
    ),
    (
      v_empresa_id,
      'Leticia Cabrera',
      '0991867365',
      NULL,
      'leticia cabrera'
    ),
    (
      v_empresa_id,
      'Leticia Cardozo',
      '0991790050',
      NULL,
      'leticia cardozo'
    ),
    (
      v_empresa_id,
      'Leticia Cassa',
      '0974801484',
      NULL,
      'leticia cassa'
    ),
    (
      v_empresa_id,
      'Leticia Centurion',
      '0991181503',
      NULL,
      'leticia centurion'
    ),
    (
      v_empresa_id,
      'Leticia Encina',
      '0975571608',
      NULL,
      'leticia encina'
    ),
    (
      v_empresa_id,
      'Leticia Espinoza',
      '0972202931',
      NULL,
      'leticia espinoza'
    ),
    (
      v_empresa_id,
      'Leticia Esquivel',
      '0961785666',
      NULL,
      'leticia esquivel'
    ),
    (
      v_empresa_id,
      'Leticia Ferreira',
      '0971266266',
      NULL,
      'leticia ferreira'
    ),
    (
      v_empresa_id,
      'Leticia Figarfia',
      '0982362077',
      NULL,
      'leticia figarfia'
    ),
    (
      v_empresa_id,
      'Leticia Figueredo',
      '0982970466',
      NULL,
      'leticia figueredo'
    ),
    (
      v_empresa_id,
      'Leticia Fonceca',
      '0982443421',
      NULL,
      'leticia fonceca'
    ),
    (
      v_empresa_id,
      'Leticia Frutos',
      '0971931981',
      NULL,
      'leticia frutos'
    ),
    (
      v_empresa_id,
      'Leticia Galeano',
      '0982177759',
      NULL,
      'leticia galeano'
    ),
    (
      v_empresa_id,
      'Leticia Garcete',
      '0992612155',
      NULL,
      'leticia garcete'
    ),
    (
      v_empresa_id,
      'Leticia Horvath',
      '0981428359',
      NULL,
      'leticia horvath'
    ),
    (
      v_empresa_id,
      'Leticia Jara',
      '0984326042',
      NULL,
      'leticia jara'
    ),
    (
      v_empresa_id,
      'Leticia Leiva',
      '0981345772',
      NULL,
      'leticia leiva'
    ),
    (
      v_empresa_id,
      'Leticia Llamas',
      '0994881792',
      '10mil',
      'leticia llamas'
    ),
    (
      v_empresa_id,
      'Leticia Llanos',
      '0994881792',
      NULL,
      'leticia llanos'
    ),
    (
      v_empresa_id,
      'Leticia Lopez',
      '0981139544',
      NULL,
      'leticia lopez'
    ),
    (
      v_empresa_id,
      'Leticia Maciel',
      '0981197971',
      '1 selo (3)',
      'leticia maciel'
    ),
    (
      v_empresa_id,
      'Leticia Mancuello',
      '0994660545',
      NULL,
      'leticia mancuello'
    ),
    (
      v_empresa_id,
      'Leticia Mercado',
      '0992499238',
      NULL,
      'leticia mercado'
    ),
    (
      v_empresa_id,
      'Leticia Molas',
      '0981678191',
      NULL,
      'leticia molas'
    ),
    (
      v_empresa_id,
      'Leticia Nunes',
      '0982590596',
      NULL,
      'leticia nunes'
    ),
    (
      v_empresa_id,
      'Leticia Nunez',
      '0982590596',
      NULL,
      'leticia nunez'
    ),
    (
      v_empresa_id,
      'Leticia Obelar',
      '0983403148',
      NULL,
      'leticia obelar'
    ),
    (
      v_empresa_id,
      'Leticia Ojeda',
      '0981541042',
      NULL,
      'leticia ojeda'
    ),
    (
      v_empresa_id,
      'Leticia Orella',
      '0991203282',
      NULL,
      'leticia orella'
    ),
    (
      v_empresa_id,
      'Leticia Ortiz',
      '0973201540',
      NULL,
      'leticia ortiz'
    ),
    (
      v_empresa_id,
      'Leticia Orue',
      '0994341182',
      NULL,
      'leticia orue'
    ),
    (
      v_empresa_id,
      'Leticia Ovelar',
      '0983403148',
      NULL,
      'leticia ovelar'
    ),
    (
      v_empresa_id,
      'Leticia Rivas',
      '0975282377',
      NULL,
      'leticia rivas'
    ),
    (
      v_empresa_id,
      'Leticia Ruiz Diaz',
      '0983906975',
      NULL,
      'leticia ruiz diaz'
    ),
    (
      v_empresa_id,
      'Leticia Sanabria',
      '0983458314',
      NULL,
      'leticia sanabria'
    ),
    (
      v_empresa_id,
      'Leticia Sanchez',
      '0985526466',
      '1 selo (2)',
      'leticia sanchez'
    ),
    (
      v_empresa_id,
      'Leticia Saravia',
      '0986107524',
      NULL,
      'leticia saravia'
    ),
    (
      v_empresa_id,
      'Leticia Sosa',
      '0982971047',
      NULL,
      'leticia sosa'
    ),
    (
      v_empresa_id,
      'Leticia Steche',
      '0971591385',
      NULL,
      'leticia steche'
    ),
    (
      v_empresa_id,
      'Leticia Vera',
      '0981729623',
      NULL,
      'leticia vera'
    ),
    (
      v_empresa_id,
      'Leticia Villanueva',
      '0971774160',
      NULL,
      'leticia villanueva'
    ),
    (
      v_empresa_id,
      'Leticia Villarc',
      '0981751795',
      NULL,
      'leticia villarc'
    ),
    (
      v_empresa_id,
      'Letina Monjagata',
      '0981113375',
      NULL,
      'letina monjagata'
    ),
    (
      v_empresa_id,
      'Letizia Patino',
      '0981184984',
      '10mil',
      'letizia patino'
    ),
    (
      v_empresa_id,
      'Letty Espinola',
      '0991669724',
      '20mil',
      'letty espinola'
    ),
    (
      v_empresa_id,
      'Leydi Cabanas',
      '0981927214',
      NULL,
      'leydi cabanas'
    ),
    (
      v_empresa_id,
      'Leyla Azuada',
      '0981104367',
      '30mil',
      'leyla azuada'
    ),
    (
      v_empresa_id,
      'Leyla Gamarra',
      '0981852909',
      '20mil',
      'leyla gamarra'
    ),
    (
      v_empresa_id,
      'Lia Gomez',
      '0993538390',
      NULL,
      'lia gomez'
    ),
    (
      v_empresa_id,
      'Lia Gonzalez',
      '0985728682',
      '30MIL',
      'lia gonzalez'
    ),
    (
      v_empresa_id,
      'Lia Ramirez',
      '0971129315',
      NULL,
      'lia ramirez'
    ),
    (
      v_empresa_id,
      'Lia Valdez',
      '0983441859',
      NULL,
      'lia valdez'
    ),
    (
      v_empresa_id,
      'Librada Aguilar',
      '0982100564',
      NULL,
      'librada aguilar'
    ),
    (
      v_empresa_id,
      'Lida Gimenez',
      '0971821635',
      NULL,
      'lida gimenez'
    ),
    (
      v_empresa_id,
      'Lida Sanabria',
      '0984145159',
      NULL,
      'lida sanabria'
    ),
    (
      v_empresa_id,
      'Lidia',
      '608876',
      NULL,
      'lidia'
    ),
    (
      v_empresa_id,
      'Lidia Amarila',
      '0983212638',
      '10mil',
      'lidia amarila'
    ),
    (
      v_empresa_id,
      'Lidia Benitez',
      '0994566585',
      NULL,
      'lidia benitez'
    ),
    (
      v_empresa_id,
      'Lidia Caballero',
      '0975346109',
      NULL,
      'lidia caballero'
    ),
    (
      v_empresa_id,
      'lidia Morel',
      '0983757589',
      NULL,
      'lidia morel'
    ),
    (
      v_empresa_id,
      'Lidia Pereira',
      '0981700844',
      NULL,
      'lidia pereira'
    ),
    (
      v_empresa_id,
      'Lidia Vargas',
      '0983393392',
      NULL,
      'lidia vargas'
    ),
    (
      v_empresa_id,
      'Lilia Raquel Romero',
      '0983276884',
      NULL,
      'lilia raquel romero'
    ),
    (
      v_empresa_id,
      'Lilian',
      NULL,
      NULL,
      'lilian'
    ),
    (
      v_empresa_id,
      'Lilian Acosta',
      '0992235917',
      NULL,
      'lilian acosta'
    ),
    (
      v_empresa_id,
      'Lilian Almada',
      '0991684464',
      NULL,
      'lilian almada'
    ),
    (
      v_empresa_id,
      'Lilian Analia Cabanas',
      '0971914677',
      NULL,
      'lilian analia cabanas'
    ),
    (
      v_empresa_id,
      'Lilian Ayala',
      '0971866745',
      NULL,
      'lilian ayala'
    ),
    (
      v_empresa_id,
      'Lilian Cabrera',
      '0981352259',
      '10MIL',
      'lilian cabrera'
    ),
    (
      v_empresa_id,
      'Lilian Cardozo',
      '0971710272',
      NULL,
      'lilian cardozo'
    ),
    (
      v_empresa_id,
      'Lilian Esquivel',
      '0986180800',
      NULL,
      'lilian esquivel'
    ),
    (
      v_empresa_id,
      'Lilian Fabio',
      '0985453503',
      '10MIL',
      'lilian fabio'
    ),
    (
      v_empresa_id,
      'Lilian Figueredo',
      '0984360055',
      NULL,
      'lilian figueredo'
    ),
    (
      v_empresa_id,
      'Lilian Gaona',
      '0992575480',
      NULL,
      'lilian gaona'
    ),
    (
      v_empresa_id,
      'Lilian Gimenez',
      '0976929817',
      '10mil',
      'lilian gimenez'
    ),
    (
      v_empresa_id,
      'Lilian Mecheti',
      '0981238988',
      '1 selo (1)',
      'lilian mecheti'
    ),
    (
      v_empresa_id,
      'Lilian Munos',
      '0982883533',
      NULL,
      'lilian munos'
    ),
    (
      v_empresa_id,
      'Lilian Ojeda',
      '0981921602',
      NULL,
      'lilian ojeda'
    ),
    (
      v_empresa_id,
      'Lilian Ortiz',
      '0981219382',
      NULL,
      'lilian ortiz'
    ),
    (
      v_empresa_id,
      'Lilian Ramirez',
      '0992299850',
      NULL,
      'lilian ramirez'
    ),
    (
      v_empresa_id,
      'Lilian Ruiz',
      '0981204761',
      NULL,
      'lilian ruiz'
    ),
    (
      v_empresa_id,
      'Lilian Sanchez',
      '0981859503',
      NULL,
      'lilian sanchez'
    ),
    (
      v_empresa_id,
      'Lilian Villalba',
      '0994103977',
      NULL,
      'lilian villalba'
    ),
    (
      v_empresa_id,
      'Lilian Zaracho',
      '0972414159',
      NULL,
      'lilian zaracho'
    ),
    (
      v_empresa_id,
      'Liliana Alonso',
      '0992922990',
      NULL,
      'liliana alonso'
    ),
    (
      v_empresa_id,
      'Liliana Baez',
      '0972903022',
      NULL,
      'liliana baez'
    ),
    (
      v_empresa_id,
      'Liliana Benitez',
      '0992923743',
      NULL,
      'liliana benitez'
    ),
    (
      v_empresa_id,
      'Liliana Canu',
      '0994984943',
      '10mil',
      'liliana canu'
    ),
    (
      v_empresa_id,
      'Liliana Cuebas',
      '0971118087',
      NULL,
      'liliana cuebas'
    ),
    (
      v_empresa_id,
      'Liliana Diaz',
      '0991708622',
      '10mil',
      'liliana diaz'
    ),
    (
      v_empresa_id,
      'Liliana Espinola',
      '0975620108',
      NULL,
      'liliana espinola'
    ),
    (
      v_empresa_id,
      'Liliana Franco',
      '0961102715',
      '10mil',
      'liliana franco'
    ),
    (
      v_empresa_id,
      'Liliana Gonzalez',
      '0981007964',
      NULL,
      'liliana gonzalez'
    ),
    (
      v_empresa_id,
      'Liliana Martinez',
      '0985739525',
      NULL,
      'liliana martinez'
    ),
    (
      v_empresa_id,
      'Liliana Oviedo',
      '0986833802',
      NULL,
      'liliana oviedo'
    ),
    (
      v_empresa_id,
      'Liliana Pereira',
      '0983637816',
      NULL,
      'liliana pereira'
    ),
    (
      v_empresa_id,
      'Liliana Rodriguez',
      '0992432600',
      NULL,
      'liliana rodriguez'
    ),
    (
      v_empresa_id,
      'Liliana Ruiz Diaz',
      '0981204761',
      NULL,
      'liliana ruiz diaz'
    ),
    (
      v_empresa_id,
      'Liliana Silva',
      '0971702181',
      NULL,
      'liliana silva'
    ),
    (
      v_empresa_id,
      'Liliana Valera',
      '0994563818',
      NULL,
      'liliana valera'
    ),
    (
      v_empresa_id,
      'Liliana Zax',
      '0985527904',
      NULL,
      'liliana zax'
    ),
    (
      v_empresa_id,
      'LilianOviedo',
      '0986833802',
      NULL,
      'lilianoviedo'
    ),
    (
      v_empresa_id,
      'Lilioan Ocampos',
      '0972741677',
      NULL,
      'lilioan ocampos'
    ),
    (
      v_empresa_id,
      'Lincy Britos',
      '0972493061',
      NULL,
      'lincy britos'
    ),
    (
      v_empresa_id,
      'Linda Espinola',
      '0972532225',
      '10mil',
      'linda espinola'
    ),
    (
      v_empresa_id,
      'Lindsay Ferreira',
      '0985866889',
      NULL,
      'lindsay ferreira'
    ),
    (
      v_empresa_id,
      'Linzi Britos',
      '0972493061',
      NULL,
      'linzi britos'
    ),
    (
      v_empresa_id,
      'lirian Amarila',
      '0983212638',
      '10mil',
      'lirian amarila'
    ),
    (
      v_empresa_id,
      'Lis Bogado',
      '0974764511',
      NULL,
      'lis bogado'
    ),
    (
      v_empresa_id,
      'Lis Colman',
      '0991684664',
      '20mil',
      'lis colman'
    ),
    (
      v_empresa_id,
      'Lisa Ramirez',
      '0971989372',
      '10mil''',
      'lisa ramirez'
    ),
    (
      v_empresa_id,
      'Lisa Riquetti',
      '0972997789',
      NULL,
      'lisa riquetti'
    ),
    (
      v_empresa_id,
      'Lisa Rojas',
      '0981115868',
      NULL,
      'lisa rojas'
    ),
    (
      v_empresa_id,
      'Lisandri Florentin',
      '0982104925',
      NULL,
      'lisandri florentin'
    ),
    (
      v_empresa_id,
      'Lisania Ruiz',
      '0975331321',
      '10mil',
      'lisania ruiz'
    ),
    (
      v_empresa_id,
      'Lisania Sanchez',
      '0984448020',
      NULL,
      'lisania sanchez'
    ),
    (
      v_empresa_id,
      'Liset Farina',
      '0986780378',
      '10mil',
      'liset farina'
    ),
    (
      v_empresa_id,
      'Lissandry Solavarrieta',
      '0986506582',
      NULL,
      'lissandry solavarrieta'
    ),
    (
      v_empresa_id,
      'Lissie Dominguez',
      '0986573771',
      NULL,
      'lissie dominguez'
    ),
    (
      v_empresa_id,
      'LissieDominguez',
      '0986573771',
      NULL,
      'lissiedominguez'
    ),
    (
      v_empresa_id,
      'Liz',
      '0981423667',
      NULL,
      'liz'
    ),
    (
      v_empresa_id,
      'Liz Acuna',
      '0992952389',
      NULL,
      'liz acuna'
    ),
    (
      v_empresa_id,
      'Liz Adriana Ramirez',
      '0985872609',
      NULL,
      'liz adriana ramirez'
    ),
    (
      v_empresa_id,
      'Liz Aguilera',
      '0983362879',
      '10mil',
      'liz aguilera'
    ),
    (
      v_empresa_id,
      'Liz Alcaraz',
      '0971525711',
      NULL,
      'liz alcaraz'
    ),
    (
      v_empresa_id,
      'Liz Amarilla',
      '0982943012',
      NULL,
      'liz amarilla'
    ),
    (
      v_empresa_id,
      'Liz Ana Villalba',
      '0982089179',
      '10mil',
      'liz ana villalba'
    ),
    (
      v_empresa_id,
      'Liz Aranda',
      '0994902418',
      NULL,
      'liz aranda'
    ),
    (
      v_empresa_id,
      'Liz Arevalos',
      '0981802640',
      NULL,
      'liz arevalos'
    ),
    (
      v_empresa_id,
      'Liz Armoa',
      '0983986736',
      NULL,
      'liz armoa'
    ),
    (
      v_empresa_id,
      'Liz Avalos',
      '0991713360',
      NULL,
      'liz avalos'
    ),
    (
      v_empresa_id,
      'Liz Barreto',
      '0986468075',
      '50mil',
      'liz barreto'
    ),
    (
      v_empresa_id,
      'Liz Barrios',
      '0991500505',
      NULL,
      'liz barrios'
    ),
    (
      v_empresa_id,
      'Liz Benitez',
      '0992375758',
      '10mil',
      'liz benitez'
    ),
    (
      v_empresa_id,
      'Liz Bogado',
      '0974764511',
      NULL,
      'liz bogado'
    ),
    (
      v_empresa_id,
      'Liz Britez',
      '0981249677',
      NULL,
      'liz britez'
    ),
    (
      v_empresa_id,
      'Liz Brizuela',
      '0991906092',
      NULL,
      'liz brizuela'
    ),
    (
      v_empresa_id,
      'Liz Cabrera',
      '0961970455',
      NULL,
      'liz cabrera'
    ),
    (
      v_empresa_id,
      'Liz Candia',
      '0983346742',
      NULL,
      'liz candia'
    ),
    (
      v_empresa_id,
      'Liz Cantero',
      '0992249621',
      NULL,
      'liz cantero'
    ),
    (
      v_empresa_id,
      'Liz Colman',
      '0983267310',
      NULL,
      'liz colman'
    ),
    (
      v_empresa_id,
      'Liz Coronel',
      '0984219304',
      '20mil',
      'liz coronel'
    ),
    (
      v_empresa_id,
      'Liz Correa',
      '0994233243',
      NULL,
      'liz correa'
    ),
    (
      v_empresa_id,
      'Liz Cuba',
      '0985988610',
      NULL,
      'liz cuba'
    ),
    (
      v_empresa_id,
      'Liz Delfini',
      '0986556167',
      NULL,
      'liz delfini'
    ),
    (
      v_empresa_id,
      'Liz Duarte',
      '0983246292',
      NULL,
      'liz duarte'
    ),
    (
      v_empresa_id,
      'Liz Ferreira',
      '0983018132',
      NULL,
      'liz ferreira'
    ),
    (
      v_empresa_id,
      'Liz Franco',
      '0981933805',
      NULL,
      'liz franco'
    ),
    (
      v_empresa_id,
      'Liz Garcete',
      '0973510314',
      NULL,
      'liz garcete'
    ),
    (
      v_empresa_id,
      'Liz Gauto',
      '0992715204',
      NULL,
      'liz gauto'
    ),
    (
      v_empresa_id,
      'Liz Gonzalez',
      '0986859024',
      NULL,
      'liz gonzalez'
    ),
    (
      v_empresa_id,
      'Liz Guerrero',
      '0994133355',
      NULL,
      'liz guerrero'
    ),
    (
      v_empresa_id,
      'Liz Lorena Sayas Escobar',
      '0986406099',
      NULL,
      'liz lorena sayas escobar'
    ),
    (
      v_empresa_id,
      'Liz Maidana',
      '0981623446',
      NULL,
      'liz maidana'
    ),
    (
      v_empresa_id,
      'Liz Man',
      '0981325070',
      NULL,
      'liz man'
    ),
    (
      v_empresa_id,
      'Liz Martinez',
      '0984515365',
      NULL,
      'liz martinez'
    ),
    (
      v_empresa_id,
      'Liz Melagarejo',
      '0984479046',
      NULL,
      'liz melagarejo'
    ),
    (
      v_empresa_id,
      'Liz Mendoza',
      '0982274327',
      '1  selo (1)',
      'liz mendoza'
    ),
    (
      v_empresa_id,
      'Liz Mereles',
      '0972697429',
      NULL,
      'liz mereles'
    ),
    (
      v_empresa_id,
      'Liz Molinas',
      '0983665718',
      NULL,
      'liz molinas'
    ),
    (
      v_empresa_id,
      'Liz Morinigo',
      '0976227792',
      '1 selo (1)',
      'liz morinigo'
    ),
    (
      v_empresa_id,
      'Liz Nunez',
      '0991224593',
      NULL,
      'liz nunez'
    ),
    (
      v_empresa_id,
      'Liz Ocampos',
      '0983688617',
      NULL,
      'liz ocampos'
    ),
    (
      v_empresa_id,
      'Liz Paola Notario',
      '0971315306',
      NULL,
      'liz paola notario'
    ),
    (
      v_empresa_id,
      'Liz Paola Vera',
      '0981517727',
      NULL,
      'liz paola vera'
    ),
    (
      v_empresa_id,
      'Liz Quinonez',
      '0973894158',
      NULL,
      'liz quinonez'
    ),
    (
      v_empresa_id,
      'Liz Ramirez',
      '0972302155',
      NULL,
      'liz ramirez'
    ),
    (
      v_empresa_id,
      'Liz Rios',
      '0984180508',
      NULL,
      'liz rios'
    ),
    (
      v_empresa_id,
      'Liz Robledo',
      '0981647740',
      '1 selo (4)',
      'liz robledo'
    ),
    (
      v_empresa_id,
      'Liz Rodas',
      '0991633822',
      NULL,
      'liz rodas'
    ),
    (
      v_empresa_id,
      'Liz Rodriguez',
      '0982736036',
      NULL,
      'liz rodriguez'
    ),
    (
      v_empresa_id,
      'Liz Rojas',
      '0983319444',
      '10MIL',
      'liz rojas'
    ),
    (
      v_empresa_id,
      'Liz Romero',
      '0981251211',
      NULL,
      'liz romero'
    ),
    (
      v_empresa_id,
      'Liz Sallas',
      '0984474692',
      NULL,
      'liz sallas'
    ),
    (
      v_empresa_id,
      'Liz Salsedo',
      '0985912633',
      NULL,
      'liz salsedo'
    ),
    (
      v_empresa_id,
      'Liz Santa curz',
      '0984860820',
      '10mil',
      'liz santa curz'
    ),
    (
      v_empresa_id,
      'Liz Saucedo',
      '0985912633',
      NULL,
      'liz saucedo'
    ),
    (
      v_empresa_id,
      'Liz Vera',
      '0976432130',
      '1 selo (10)',
      'liz vera'
    ),
    (
      v_empresa_id,
      'Liz Zayas',
      '0984474692',
      NULL,
      'liz zayas'
    ),
    (
      v_empresa_id,
      'Liza Agona',
      '0986691832',
      '10mil',
      'liza agona'
    ),
    (
      v_empresa_id,
      'Liza Britez',
      '0985987140',
      '10MIL',
      'liza britez'
    ),
    (
      v_empresa_id,
      'Liza Contrera',
      '0992287424',
      '10mil',
      'liza contrera'
    ),
    (
      v_empresa_id,
      'Liza Garcia',
      '0982114637',
      NULL,
      'liza garcia'
    ),
    (
      v_empresa_id,
      'Liza Gauto',
      '0985308424',
      '20mil',
      'liza gauto'
    ),
    (
      v_empresa_id,
      'Liza Martinez',
      '0992752292',
      NULL,
      'liza martinez'
    ),
    (
      v_empresa_id,
      'Liza Ramirez',
      '0972688260',
      '1 selo (1)',
      'liza ramirez'
    ),
    (
      v_empresa_id,
      'Liza Santacruz',
      '0991588738',
      NULL,
      'liza santacruz'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 7: filas 3001..3500
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Liza Valenzuela',
      '0975514189',
      NULL,
      'liza valenzuela'
    ),
    (
      v_empresa_id,
      'Lizandri Livera',
      '0971896117',
      NULL,
      'lizandri livera'
    ),
    (
      v_empresa_id,
      'Lizet Barrios',
      '0972655373',
      NULL,
      'lizet barrios'
    ),
    (
      v_empresa_id,
      'Lizi Fajardo',
      '0981373505',
      NULL,
      'lizi fajardo'
    ),
    (
      v_empresa_id,
      'Lizza Duarte',
      '0984178106',
      '20MIL',
      'lizza duarte'
    ),
    (
      v_empresa_id,
      'Lizza Veron',
      '0971975313',
      NULL,
      'lizza veron'
    ),
    (
      v_empresa_id,
      'Lizzi Candia',
      '0971565008',
      NULL,
      'lizzi candia'
    ),
    (
      v_empresa_id,
      'Lluvia Quintana',
      '0981066060',
      NULL,
      'lluvia quintana'
    ),
    (
      v_empresa_id,
      'Logia Colman',
      '0983971645',
      NULL,
      'logia colman'
    ),
    (
      v_empresa_id,
      'Loles Pallares',
      NULL,
      NULL,
      'loles pallares'
    ),
    (
      v_empresa_id,
      'Lordes Mancit',
      '0981260169',
      NULL,
      'lordes mancit'
    ),
    (
      v_empresa_id,
      'Lore De Los Santos',
      '0991623022',
      NULL,
      'lore de los santos'
    ),
    (
      v_empresa_id,
      'Loren Bernal',
      '0993430007',
      NULL,
      'loren bernal'
    ),
    (
      v_empresa_id,
      'Loren Sevia',
      '0982587326',
      NULL,
      'loren sevia'
    ),
    (
      v_empresa_id,
      'Lorena',
      NULL,
      NULL,
      'lorena'
    ),
    (
      v_empresa_id,
      'Lorena Alujas',
      '0985361311',
      NULL,
      'lorena alujas'
    ),
    (
      v_empresa_id,
      'Lorena Ayala',
      '0984474465',
      NULL,
      'lorena ayala'
    ),
    (
      v_empresa_id,
      'Lorena Barrios',
      '0972516079',
      NULL,
      'lorena barrios'
    ),
    (
      v_empresa_id,
      'Lorena Brasser',
      '0986112782',
      NULL,
      'lorena brasser'
    ),
    (
      v_empresa_id,
      'Lorena Caceres',
      '0984202423',
      NULL,
      'lorena caceres'
    ),
    (
      v_empresa_id,
      'Lorena Castillo',
      '0981734913',
      '20MIL',
      'lorena castillo'
    ),
    (
      v_empresa_id,
      'Lorena Cespedes',
      '0981649922',
      NULL,
      'lorena cespedes'
    ),
    (
      v_empresa_id,
      'Lorena Couchonal',
      '0992575148',
      NULL,
      'lorena couchonal'
    ),
    (
      v_empresa_id,
      'Lorena Duarte',
      '0972707787',
      NULL,
      'lorena duarte'
    ),
    (
      v_empresa_id,
      'Lorena Farias',
      '0986458955',
      NULL,
      'lorena farias'
    ),
    (
      v_empresa_id,
      'Lorena Ferreira',
      '0984789193',
      NULL,
      'lorena ferreira'
    ),
    (
      v_empresa_id,
      'Lorena Forza',
      '0971926341',
      '30mil',
      'lorena forza'
    ),
    (
      v_empresa_id,
      'Lorena Genes',
      '0971284010',
      '10mil',
      'lorena genes'
    ),
    (
      v_empresa_id,
      'Lorena Koopmann',
      '0991908538',
      NULL,
      'lorena koopmann'
    ),
    (
      v_empresa_id,
      'Lorena Leon',
      '0992207654',
      NULL,
      'lorena leon'
    ),
    (
      v_empresa_id,
      'Lorena Lugo',
      '0992400810',
      NULL,
      'lorena lugo'
    ),
    (
      v_empresa_id,
      'Lorena Meza',
      '0984400905',
      '20MIL',
      'lorena meza'
    ),
    (
      v_empresa_id,
      'Lorena Miaranda',
      '0982114769',
      NULL,
      'lorena miaranda'
    ),
    (
      v_empresa_id,
      'Lorena Miranda',
      '0986879995',
      NULL,
      'lorena miranda'
    ),
    (
      v_empresa_id,
      'Lorena Mongelos',
      '0994344632',
      NULL,
      'lorena mongelos'
    ),
    (
      v_empresa_id,
      'Lorena Ortega',
      '0986409779',
      NULL,
      'lorena ortega'
    ),
    (
      v_empresa_id,
      'Lorena Ortiz',
      '0972211690',
      '10mil',
      'lorena ortiz'
    ),
    (
      v_empresa_id,
      'Lorena Oviedo',
      '0994359982',
      NULL,
      'lorena oviedo'
    ),
    (
      v_empresa_id,
      'Lorena Ramos',
      '0984920928',
      NULL,
      'lorena ramos'
    ),
    (
      v_empresa_id,
      'Lorena Samaniego',
      '0985195260',
      NULL,
      'lorena samaniego'
    ),
    (
      v_empresa_id,
      'Lorena Sanchez',
      '0981891259',
      NULL,
      'lorena sanchez'
    ),
    (
      v_empresa_id,
      'Lorena Siliero',
      '0981949944',
      NULL,
      'lorena siliero'
    ),
    (
      v_empresa_id,
      'Lorena Vargas',
      '0982721811',
      NULL,
      'lorena vargas'
    ),
    (
      v_empresa_id,
      'Lorena Vazquez',
      '0983166465',
      NULL,
      'lorena vazquez'
    ),
    (
      v_empresa_id,
      'Lorena Vera',
      '0986275710',
      NULL,
      'lorena vera'
    ),
    (
      v_empresa_id,
      'Lorena Verdun',
      '0994252183',
      NULL,
      'lorena verdun'
    ),
    (
      v_empresa_id,
      'Lorena Villalba',
      '0986557281',
      NULL,
      'lorena villalba'
    ),
    (
      v_empresa_id,
      'Lorena Viveros',
      '0981355033',
      NULL,
      'lorena viveros'
    ),
    (
      v_empresa_id,
      'LorenaVerdun',
      '94252183',
      NULL,
      'lorenaverdun'
    ),
    (
      v_empresa_id,
      'Lorenza Escobar',
      '0992851059',
      NULL,
      'lorenza escobar'
    ),
    (
      v_empresa_id,
      'Lorna Diwa',
      '0972302302',
      NULL,
      'lorna diwa'
    ),
    (
      v_empresa_id,
      'Lorna Rojas',
      '0984651822',
      NULL,
      'lorna rojas'
    ),
    (
      v_empresa_id,
      'Lorurdes Areco',
      '0971995918',
      NULL,
      'lorurdes areco'
    ),
    (
      v_empresa_id,
      'Loudes Barrios',
      '0981196363',
      '10mil',
      'loudes barrios'
    ),
    (
      v_empresa_id,
      'Lourdes Acunha',
      '0984773626',
      NULL,
      'lourdes acunha'
    ),
    (
      v_empresa_id,
      'Lourdes Baez',
      '0981634688',
      NULL,
      'lourdes baez'
    ),
    (
      v_empresa_id,
      'Lourdes Barreiro',
      '0991407443',
      NULL,
      'lourdes barreiro'
    ),
    (
      v_empresa_id,
      'Lourdes Barrios',
      '0981196363',
      NULL,
      'lourdes barrios'
    ),
    (
      v_empresa_id,
      'Lourdes Benitez',
      '0981772654',
      NULL,
      'lourdes benitez'
    ),
    (
      v_empresa_id,
      'Lourdes Bobadilla',
      '0986820215',
      NULL,
      'lourdes bobadilla'
    ),
    (
      v_empresa_id,
      'Lourdes Espinola',
      '0971375084',
      NULL,
      'lourdes espinola'
    ),
    (
      v_empresa_id,
      'Lourdes Gamarra',
      '0971747928',
      NULL,
      'lourdes gamarra'
    ),
    (
      v_empresa_id,
      'Lourdes Gonzalez',
      '0985118390',
      '10MIL',
      'lourdes gonzalez'
    ),
    (
      v_empresa_id,
      'Lourdes Lopez',
      '0992464246',
      NULL,
      'lourdes lopez'
    ),
    (
      v_empresa_id,
      'Lourdes Maidana',
      '0981983279',
      NULL,
      'lourdes maidana'
    ),
    (
      v_empresa_id,
      'Lourdes Mancito',
      '0981260169',
      NULL,
      'lourdes mancito'
    ),
    (
      v_empresa_id,
      'Lourdes Martinez',
      '0972610046',
      NULL,
      'lourdes martinez'
    ),
    (
      v_empresa_id,
      'Lourdes Molinas',
      '0985812835',
      '30mil',
      'lourdes molinas'
    ),
    (
      v_empresa_id,
      'Lourdes Olmedo',
      '0981478830',
      NULL,
      'lourdes olmedo'
    ),
    (
      v_empresa_id,
      'Lourdes Ortellado',
      '0981477358',
      NULL,
      'lourdes ortellado'
    ),
    (
      v_empresa_id,
      'Lourdes Ramirez',
      '0994765202',
      NULL,
      'lourdes ramirez'
    ),
    (
      v_empresa_id,
      'Lourdes Rodriguez',
      '0982995767',
      NULL,
      'lourdes rodriguez'
    ),
    (
      v_empresa_id,
      'Lourdes Romero',
      '0981764848',
      NULL,
      'lourdes romero'
    ),
    (
      v_empresa_id,
      'Lourdes Ruiz Diaz',
      '0982995281',
      NULL,
      'lourdes ruiz diaz'
    ),
    (
      v_empresa_id,
      'Lourdes Saragoza',
      '0991708360',
      NULL,
      'lourdes saragoza'
    ),
    (
      v_empresa_id,
      'Lourdes Saucedo',
      '0992443958',
      NULL,
      'lourdes saucedo'
    ),
    (
      v_empresa_id,
      'Lourdes Silva',
      '0971945989',
      '10MIL',
      'lourdes silva'
    ),
    (
      v_empresa_id,
      'Lourdes Verdun',
      '0983959148',
      NULL,
      'lourdes verdun'
    ),
    (
      v_empresa_id,
      'Lourdes Zorilla',
      '0991379213',
      NULL,
      'lourdes zorilla'
    ),
    (
      v_empresa_id,
      'Lourdes Zorrila',
      '0982484287',
      NULL,
      'lourdes zorrila'
    ),
    (
      v_empresa_id,
      'Lourdez Benitez',
      '0982419653',
      NULL,
      'lourdez benitez'
    ),
    (
      v_empresa_id,
      'Lourdez Paredes',
      '0981174920',
      NULL,
      'lourdez paredes'
    ),
    (
      v_empresa_id,
      'Lourdez Riveros',
      '0976487077',
      NULL,
      'lourdez riveros'
    ),
    (
      v_empresa_id,
      'Love you forever',
      NULL,
      NULL,
      'love you forever'
    ),
    (
      v_empresa_id,
      'Love you forever tassi',
      NULL,
      NULL,
      'love you forever tassi'
    ),
    (
      v_empresa_id,
      'Luana Alvarez',
      '0984992441',
      NULL,
      'luana alvarez'
    ),
    (
      v_empresa_id,
      'Luana Benitez',
      '0976555366',
      NULL,
      'luana benitez'
    ),
    (
      v_empresa_id,
      'Luana Duarte',
      '0987158062',
      NULL,
      'luana duarte'
    ),
    (
      v_empresa_id,
      'Luana Escobar',
      '0972962369',
      NULL,
      'luana escobar'
    ),
    (
      v_empresa_id,
      'Luana Flores',
      '0994110795',
      NULL,
      'luana flores'
    ),
    (
      v_empresa_id,
      'Luana Galeano',
      '0993250786',
      NULL,
      'luana galeano'
    ),
    (
      v_empresa_id,
      'Luana Garcia',
      '0992648793',
      NULL,
      'luana garcia'
    ),
    (
      v_empresa_id,
      'Luana Mendez',
      '0981289279',
      NULL,
      'luana mendez'
    ),
    (
      v_empresa_id,
      'Luana Mendoza',
      '0994621884',
      NULL,
      'luana mendoza'
    ),
    (
      v_empresa_id,
      'Luana Recalde',
      '0987589962',
      NULL,
      'luana recalde'
    ),
    (
      v_empresa_id,
      'Luara Gill',
      '0981129277',
      NULL,
      'luara gill'
    ),
    (
      v_empresa_id,
      'Lucas Ferreira',
      '0982501687',
      NULL,
      'lucas ferreira'
    ),
    (
      v_empresa_id,
      'Lucas Isfran',
      '0986602829',
      NULL,
      'lucas isfran'
    ),
    (
      v_empresa_id,
      'Lucero Florencianes',
      '0983502876',
      NULL,
      'lucero florencianes'
    ),
    (
      v_empresa_id,
      'Lucero Pereira',
      '0972534154',
      NULL,
      'lucero pereira'
    ),
    (
      v_empresa_id,
      'Lucero Zarza',
      '0976217583',
      NULL,
      'lucero zarza'
    ),
    (
      v_empresa_id,
      'Lucia Amaro',
      '0983445900',
      NULL,
      'lucia amaro'
    ),
    (
      v_empresa_id,
      'Lucia Aveiro',
      '0972985570',
      NULL,
      'lucia aveiro'
    ),
    (
      v_empresa_id,
      'Lucia Benega',
      '0981656870',
      NULL,
      'lucia benega'
    ),
    (
      v_empresa_id,
      'Lucia Cabrera',
      '0981285848',
      NULL,
      'lucia cabrera'
    ),
    (
      v_empresa_id,
      'Lucia Galeano',
      '0986346859',
      NULL,
      'lucia galeano'
    ),
    (
      v_empresa_id,
      'Lucia Garcete',
      '0972953734',
      NULL,
      'lucia garcete'
    ),
    (
      v_empresa_id,
      'Lucia Guitierrez',
      '0985808999',
      NULL,
      'lucia guitierrez'
    ),
    (
      v_empresa_id,
      'Lucia Halley',
      '0994131146',
      NULL,
      'lucia halley'
    ),
    (
      v_empresa_id,
      'Lucia Maciel',
      '0972184020',
      NULL,
      'lucia maciel'
    ),
    (
      v_empresa_id,
      'Lucia Martinez',
      '0984333055',
      '30mil',
      'lucia martinez'
    ),
    (
      v_empresa_id,
      'Lucia Orue',
      '0994351514',
      NULL,
      'lucia orue'
    ),
    (
      v_empresa_id,
      'Lucia Pereira',
      '0971628098',
      '30MIL',
      'lucia pereira'
    ),
    (
      v_empresa_id,
      'Lucia Rodriguez',
      '0991380239',
      NULL,
      'lucia rodriguez'
    ),
    (
      v_empresa_id,
      'Lucia Vega',
      '0985944453',
      NULL,
      'lucia vega'
    ),
    (
      v_empresa_id,
      'Luciana Calijaris',
      '0981477936',
      NULL,
      'luciana calijaris'
    ),
    (
      v_empresa_id,
      'Luciana Garete',
      '0982924925',
      '10mil',
      'luciana garete'
    ),
    (
      v_empresa_id,
      'Luciana Irala',
      '0986701550',
      NULL,
      'luciana irala'
    ),
    (
      v_empresa_id,
      'Luciana Vera',
      '0986350504',
      NULL,
      'luciana vera'
    ),
    (
      v_empresa_id,
      'Luciane Zeilmann',
      '0992435594',
      NULL,
      'luciane zeilmann'
    ),
    (
      v_empresa_id,
      'Lucila Moreira',
      '0971660568',
      NULL,
      'lucila moreira'
    ),
    (
      v_empresa_id,
      'Luis Acosta',
      '0974725471',
      NULL,
      'luis acosta'
    ),
    (
      v_empresa_id,
      'Luis Alvarez',
      '0981382004',
      NULL,
      'luis alvarez'
    ),
    (
      v_empresa_id,
      'Luis Cubilla',
      '0991702671',
      NULL,
      'luis cubilla'
    ),
    (
      v_empresa_id,
      'Luis Delgado',
      '0971117043',
      NULL,
      'luis delgado'
    ),
    (
      v_empresa_id,
      'Luis Gonzales',
      '0986630021',
      '10MIL',
      'luis gonzales'
    ),
    (
      v_empresa_id,
      'Luis Lopez',
      '0981319238',
      NULL,
      'luis lopez'
    ),
    (
      v_empresa_id,
      'Luis Nunez',
      '0986770192',
      NULL,
      'luis nunez'
    ),
    (
      v_empresa_id,
      'Luis Ortiz',
      '0993309493',
      NULL,
      'luis ortiz'
    ),
    (
      v_empresa_id,
      'Luis Panza',
      '0981929745',
      NULL,
      'luis panza'
    ),
    (
      v_empresa_id,
      'Luis Ramos',
      '0984284547',
      '10mil',
      'luis ramos'
    ),
    (
      v_empresa_id,
      'Luis Rolon',
      '0976990530',
      NULL,
      'luis rolon'
    ),
    (
      v_empresa_id,
      'Luis Sino',
      '0981414013',
      NULL,
      'luis sino'
    ),
    (
      v_empresa_id,
      'Luis Sosa',
      '0992483544',
      NULL,
      'luis sosa'
    ),
    (
      v_empresa_id,
      'Luisa Chamorro',
      '0982929057',
      '10MIL',
      'luisa chamorro'
    ),
    (
      v_empresa_id,
      'Luisa Ramirez',
      '0991675738',
      NULL,
      'luisa ramirez'
    ),
    (
      v_empresa_id,
      'Luisa Villasanti',
      '0981309401',
      NULL,
      'luisa villasanti'
    ),
    (
      v_empresa_id,
      'Lujan Acosta',
      '0985604783',
      '30mil',
      'lujan acosta'
    ),
    (
      v_empresa_id,
      'Lujan Araujo',
      '0976757574',
      NULL,
      'lujan araujo'
    ),
    (
      v_empresa_id,
      'Lujan Benitez',
      '0983324649',
      NULL,
      'lujan benitez'
    ),
    (
      v_empresa_id,
      'Lujan Cabrera',
      '0984835422',
      NULL,
      'lujan cabrera'
    ),
    (
      v_empresa_id,
      'Lujan Colman',
      '0993575500',
      NULL,
      'lujan colman'
    ),
    (
      v_empresa_id,
      'Lujan Coronel',
      '0986565825',
      NULL,
      'lujan coronel'
    ),
    (
      v_empresa_id,
      'Lujan Figueredo',
      '0971205083',
      NULL,
      'lujan figueredo'
    ),
    (
      v_empresa_id,
      'Lujan Gonzalez',
      '0982182126',
      NULL,
      'lujan gonzalez'
    ),
    (
      v_empresa_id,
      'Lujan Lizza',
      '0971978938',
      NULL,
      'lujan lizza'
    ),
    (
      v_empresa_id,
      'Lujan Lopez',
      '0981637538',
      NULL,
      'lujan lopez'
    ),
    (
      v_empresa_id,
      'Lujan Morel',
      '0985323555',
      NULL,
      'lujan morel'
    ),
    (
      v_empresa_id,
      'Lujan Ojeda',
      '0971606194',
      NULL,
      'lujan ojeda'
    ),
    (
      v_empresa_id,
      'Lujan Ortigoza',
      '0984890063',
      NULL,
      'lujan ortigoza'
    ),
    (
      v_empresa_id,
      'Lujan Pereyra',
      '0982358515',
      NULL,
      'lujan pereyra'
    ),
    (
      v_empresa_id,
      'Lujan Pintos',
      '0984109853',
      NULL,
      'lujan pintos'
    ),
    (
      v_empresa_id,
      'Lujan Riquelme',
      '0994311161',
      NULL,
      'lujan riquelme'
    ),
    (
      v_empresa_id,
      'Lujan Rivero',
      '0981782153',
      '10mil',
      'lujan rivero'
    ),
    (
      v_empresa_id,
      'Lujan Rodriguez',
      '0972978203',
      NULL,
      'lujan rodriguez'
    ),
    (
      v_empresa_id,
      'Lujan Rojas',
      '0983288121',
      NULL,
      'lujan rojas'
    ),
    (
      v_empresa_id,
      'Lujan Sanabria',
      '0981229555',
      NULL,
      'lujan sanabria'
    ),
    (
      v_empresa_id,
      'Lujan Suarez',
      '0986661204',
      '10MIL',
      'lujan suarez'
    ),
    (
      v_empresa_id,
      'Lujan torres',
      '0985900114',
      NULL,
      'lujan torres'
    ),
    (
      v_empresa_id,
      'Lujan Valdez',
      '0972370100',
      NULL,
      'lujan valdez'
    ),
    (
      v_empresa_id,
      'Lujan Vera',
      '0984801733',
      NULL,
      'lujan vera'
    ),
    (
      v_empresa_id,
      'Lujan Zorrilla',
      '0971293116',
      NULL,
      'lujan zorrilla'
    ),
    (
      v_empresa_id,
      'Luordes Talavera',
      '0995680144',
      '10mil',
      'luordes talavera'
    ),
    (
      v_empresa_id,
      'Lupe Vera',
      '0983512809',
      NULL,
      'lupe vera'
    ),
    (
      v_empresa_id,
      'Lurde Acosta',
      '0983956191',
      NULL,
      'lurde acosta'
    ),
    (
      v_empresa_id,
      'Lurdes Almidon',
      '9922966547',
      NULL,
      'lurdes almidon'
    ),
    (
      v_empresa_id,
      'Lurdes Avila',
      '0994980420',
      NULL,
      'lurdes avila'
    ),
    (
      v_empresa_id,
      'Lurdes Barreto',
      '0972249748',
      NULL,
      'lurdes barreto'
    ),
    (
      v_empresa_id,
      'Lurdes Caballero',
      '0981153945',
      NULL,
      'lurdes caballero'
    ),
    (
      v_empresa_id,
      'Lurdes Carocini',
      '0981190687',
      NULL,
      'lurdes carocini'
    ),
    (
      v_empresa_id,
      'Lurdes Estigarribia',
      '0981413432',
      '1 selo (1)',
      'lurdes estigarribia'
    ),
    (
      v_empresa_id,
      'Lurdes Etigarribia',
      '0981413432',
      NULL,
      'lurdes etigarribia'
    ),
    (
      v_empresa_id,
      'Lurdes Guererro',
      '0984174777',
      NULL,
      'lurdes guererro'
    ),
    (
      v_empresa_id,
      'Lurdes Oviedo',
      '0971463667',
      NULL,
      'lurdes oviedo'
    ),
    (
      v_empresa_id,
      'Lurdes Perez',
      '0984102610',
      NULL,
      'lurdes perez'
    ),
    (
      v_empresa_id,
      'Lurdes Segovia',
      '0971875502',
      '20MIL',
      'lurdes segovia'
    ),
    (
      v_empresa_id,
      'Lurdes Trinidad',
      '0985340010',
      NULL,
      'lurdes trinidad'
    ),
    (
      v_empresa_id,
      'Lurdes Zorrilla',
      '0982484287',
      NULL,
      'lurdes zorrilla'
    ),
    (
      v_empresa_id,
      'Lusania Ruiz',
      '0975331321',
      NULL,
      'lusania ruiz'
    ),
    (
      v_empresa_id,
      'Luz Almoa',
      '0981116251',
      NULL,
      'luz almoa'
    ),
    (
      v_empresa_id,
      'Luz Amarilla',
      '0984749792',
      '1 selo (1)',
      'luz amarilla'
    ),
    (
      v_empresa_id,
      'Luz Ayala',
      '0991345086',
      NULL,
      'luz ayala'
    ),
    (
      v_empresa_id,
      'Luz Baez',
      '0983801201',
      NULL,
      'luz baez'
    ),
    (
      v_empresa_id,
      'Luz Bazan',
      '0961463992',
      NULL,
      'luz bazan'
    ),
    (
      v_empresa_id,
      'Luz Bedoya',
      '0971688998',
      NULL,
      'luz bedoya'
    ),
    (
      v_empresa_id,
      'Luz Bernal',
      '0976104415',
      NULL,
      'luz bernal'
    ),
    (
      v_empresa_id,
      'Luz Chavez',
      '0994718972',
      NULL,
      'luz chavez'
    ),
    (
      v_empresa_id,
      'Luz Estigarribia',
      '0982641489',
      '30mil',
      'luz estigarribia'
    ),
    (
      v_empresa_id,
      'Luz Ferreira',
      '0983783269',
      NULL,
      'luz ferreira'
    ),
    (
      v_empresa_id,
      'Luz Florentin',
      '0982385924',
      '10mil',
      'luz florentin'
    ),
    (
      v_empresa_id,
      'Luz Flores',
      '0981178998',
      NULL,
      'luz flores'
    ),
    (
      v_empresa_id,
      'Luz Franco',
      '0981506921',
      NULL,
      'luz franco'
    ),
    (
      v_empresa_id,
      'Luz Galeano Ferreira',
      '0994391528',
      NULL,
      'luz galeano ferreira'
    ),
    (
      v_empresa_id,
      'Luz Gavilan',
      '0961868440',
      NULL,
      'luz gavilan'
    ),
    (
      v_empresa_id,
      'Luz Gonzalez',
      '0992928462',
      '20MIL',
      'luz gonzalez'
    ),
    (
      v_empresa_id,
      'Luz Jara',
      '0971591177',
      NULL,
      'luz jara'
    ),
    (
      v_empresa_id,
      'Luz Loguera',
      '0992244492',
      '10mil',
      'luz loguera'
    ),
    (
      v_empresa_id,
      'Luz Marina Gloria Gonzalez',
      '0972100396',
      NULL,
      'luz marina gloria gonzalez'
    ),
    (
      v_empresa_id,
      'Luz Marina Salinas',
      '0972116921',
      '10MIL',
      'luz marina salinas'
    ),
    (
      v_empresa_id,
      'Luz Martinez',
      '0993378648',
      NULL,
      'luz martinez'
    ),
    (
      v_empresa_id,
      'Luz Melgarejo',
      '0983746455',
      NULL,
      'luz melgarejo'
    ),
    (
      v_empresa_id,
      'Luz Mercado',
      NULL,
      NULL,
      'luz mercado'
    ),
    (
      v_empresa_id,
      'Luz Noguera',
      '0961874114',
      NULL,
      'luz noguera'
    ),
    (
      v_empresa_id,
      'Luz Ortiz',
      '0994396683',
      '10mil',
      'luz ortiz'
    ),
    (
      v_empresa_id,
      'Luz Ovelar',
      '0986238714',
      NULL,
      'luz ovelar'
    ),
    (
      v_empresa_id,
      'Luz Pereira',
      '0976929842',
      NULL,
      'luz pereira'
    ),
    (
      v_empresa_id,
      'Luz Ramirez',
      '0991719731',
      NULL,
      'luz ramirez'
    ),
    (
      v_empresa_id,
      'Luz Rosalba',
      '0981617009',
      NULL,
      'luz rosalba'
    ),
    (
      v_empresa_id,
      'Luz Rotela',
      '0982707088',
      NULL,
      'luz rotela'
    ),
    (
      v_empresa_id,
      'Luz Sotto',
      '0985689077',
      NULL,
      'luz sotto'
    ),
    (
      v_empresa_id,
      'Luz Telles',
      '0982995998',
      NULL,
      'luz telles'
    ),
    (
      v_empresa_id,
      'Luz Torres',
      '0972759733',
      NULL,
      'luz torres'
    ),
    (
      v_empresa_id,
      'Luz Vargas',
      '0984483868',
      NULL,
      'luz vargas'
    ),
    (
      v_empresa_id,
      'Luz Vera',
      '0994302565',
      NULL,
      'luz vera'
    ),
    (
      v_empresa_id,
      'Luz Zaracho',
      '0994668873',
      NULL,
      'luz zaracho'
    ),
    (
      v_empresa_id,
      'Luzinette Cespedes',
      '0971629011',
      '30mil',
      'luzinette cespedes'
    ),
    (
      v_empresa_id,
      'lyda Sanabria',
      '0984145159',
      NULL,
      'lyda sanabria'
    ),
    (
      v_empresa_id,
      'lyf',
      NULL,
      NULL,
      'lyf'
    ),
    (
      v_empresa_id,
      'lyf sets',
      NULL,
      NULL,
      'lyf sets'
    ),
    (
      v_empresa_id,
      'M0nica Galilea',
      '0981981142',
      '10MIL',
      'm0nica galilea'
    ),
    (
      v_empresa_id,
      'Ma Angel Barrios',
      '0982522520',
      NULL,
      'ma angel barrios'
    ),
    (
      v_empresa_id,
      'Ma. Jose Martinez',
      '0981737159',
      NULL,
      'ma. jose martinez'
    ),
    (
      v_empresa_id,
      'Mabel Adorno',
      '0991366128',
      '10mil',
      'mabel adorno'
    ),
    (
      v_empresa_id,
      'Mabel Benitez',
      '0991348600',
      NULL,
      'mabel benitez'
    ),
    (
      v_empresa_id,
      'Mabel Borges',
      '0972435705',
      NULL,
      'mabel borges'
    ),
    (
      v_empresa_id,
      'Mabel Paredes',
      '0992436681',
      NULL,
      'mabel paredes'
    ),
    (
      v_empresa_id,
      'Mabel Romero',
      NULL,
      '1 selo (1)',
      'mabel romero'
    ),
    (
      v_empresa_id,
      'Mabel Talavera',
      '0995680144',
      NULL,
      'mabel talavera'
    ),
    (
      v_empresa_id,
      'Macarena Alfonso',
      '0984656245',
      NULL,
      'macarena alfonso'
    ),
    (
      v_empresa_id,
      'Macarena Amarilla',
      '0986225642',
      NULL,
      'macarena amarilla'
    ),
    (
      v_empresa_id,
      'Macarena Aponte',
      '0981548808',
      NULL,
      'macarena aponte'
    ),
    (
      v_empresa_id,
      'Macarena Candia',
      '0981131950',
      NULL,
      'macarena candia'
    ),
    (
      v_empresa_id,
      'Macarena Cristaldo',
      '0971487068',
      NULL,
      'macarena cristaldo'
    ),
    (
      v_empresa_id,
      'Macarena Gutierrez',
      '0972103978',
      NULL,
      'macarena gutierrez'
    ),
    (
      v_empresa_id,
      'Macarena Martinez',
      '0986660482',
      NULL,
      'macarena martinez'
    ),
    (
      v_empresa_id,
      'Macarena Medina',
      '0991636454',
      NULL,
      'macarena medina'
    ),
    (
      v_empresa_id,
      'Macarena Morel',
      '0993437449',
      NULL,
      'macarena morel'
    ),
    (
      v_empresa_id,
      'Macarena Noguera',
      '0983927005',
      NULL,
      'macarena noguera'
    ),
    (
      v_empresa_id,
      'Macarena Riveros',
      '0981100946',
      NULL,
      'macarena riveros'
    ),
    (
      v_empresa_id,
      'Madai Chavez',
      '0985575610',
      NULL,
      'madai chavez'
    ),
    (
      v_empresa_id,
      'Made',
      '0983646110',
      'A',
      'made'
    ),
    (
      v_empresa_id,
      'Madelin',
      '0983646110',
      NULL,
      'madelin'
    ),
    (
      v_empresa_id,
      'Madelin Cabanas',
      '0983646110',
      NULL,
      'madelin cabanas'
    ),
    (
      v_empresa_id,
      'Madeline Cabanas',
      NULL,
      NULL,
      'madeline cabanas'
    ),
    (
      v_empresa_id,
      'Mafe Mora',
      '0981255313',
      NULL,
      'mafe mora'
    ),
    (
      v_empresa_id,
      'Magali Andraga',
      '0992170858',
      '10mil',
      'magali andraga'
    ),
    (
      v_empresa_id,
      'Magali Aralcon',
      '0982919855',
      NULL,
      'magali aralcon'
    ),
    (
      v_empresa_id,
      'Magali Benitez',
      '0982993878',
      NULL,
      'magali benitez'
    ),
    (
      v_empresa_id,
      'Magali Duarte',
      '0976487626',
      NULL,
      'magali duarte'
    ),
    (
      v_empresa_id,
      'Magali Fucusara',
      '0972262132',
      NULL,
      'magali fucusara'
    ),
    (
      v_empresa_id,
      'Magali FUKUCHARA',
      '0972262132',
      '1 selo (2)',
      'magali fukuchara'
    ),
    (
      v_empresa_id,
      'Magali Galeano',
      '0971272561',
      NULL,
      'magali galeano'
    ),
    (
      v_empresa_id,
      'Magali Garcete',
      '0986407369',
      NULL,
      'magali garcete'
    ),
    (
      v_empresa_id,
      'Magali Genes',
      '0982183348',
      NULL,
      'magali genes'
    ),
    (
      v_empresa_id,
      'Magali Gonzalez',
      '0984925151',
      '20il',
      'magali gonzalez'
    ),
    (
      v_empresa_id,
      'Magali Larroza',
      '0994716702',
      NULL,
      'magali larroza'
    ),
    (
      v_empresa_id,
      'Magali Melida',
      '0972814668',
      NULL,
      'magali melida'
    ),
    (
      v_empresa_id,
      'Magali Mereles',
      '0971585219',
      '10MIL',
      'magali mereles'
    ),
    (
      v_empresa_id,
      'Magali Moreno',
      '0992866841',
      NULL,
      'magali moreno'
    ),
    (
      v_empresa_id,
      'Magali Ortigoza',
      '0971343140',
      NULL,
      'magali ortigoza'
    ),
    (
      v_empresa_id,
      'Magali Palacios',
      '0971797483',
      NULL,
      'magali palacios'
    ),
    (
      v_empresa_id,
      'Magali Peris',
      '0981896949',
      NULL,
      'magali peris'
    ),
    (
      v_empresa_id,
      'Magali Santander',
      '0991423842',
      NULL,
      'magali santander'
    ),
    (
      v_empresa_id,
      'Magali Sarate',
      '0971795847',
      NULL,
      'magali sarate'
    ),
    (
      v_empresa_id,
      'Magaly Molas',
      '0983945494',
      '30MIL',
      'magaly molas'
    ),
    (
      v_empresa_id,
      'Magaly Noguera',
      '0985105648',
      '20mil',
      'magaly noguera'
    ),
    (
      v_empresa_id,
      'Magaly Paiva',
      '0994982919',
      NULL,
      'magaly paiva'
    ),
    (
      v_empresa_id,
      'Magdalena Trinidad',
      '0991936545',
      NULL,
      'magdalena trinidad'
    ),
    (
      v_empresa_id,
      'Magherry Alvarez',
      '0982470410',
      NULL,
      'magherry alvarez'
    ),
    (
      v_empresa_id,
      'Magui Armoa',
      '0992221377',
      NULL,
      'magui armoa'
    ),
    (
      v_empresa_id,
      'Magui Mendez',
      '0994760888',
      NULL,
      'magui mendez'
    ),
    (
      v_empresa_id,
      'Mahia Gabazza',
      '0981271987',
      NULL,
      'mahia gabazza'
    ),
    (
      v_empresa_id,
      'Maia Samaniego',
      '0972901647',
      NULL,
      'maia samaniego'
    ),
    (
      v_empresa_id,
      'Maiara Bittencouit',
      '0992718569',
      NULL,
      'maiara bittencouit'
    ),
    (
      v_empresa_id,
      'Maida Cabanas',
      '0983310274',
      NULL,
      'maida cabanas'
    ),
    (
      v_empresa_id,
      'Maida Echeverria',
      '0994905644',
      NULL,
      'maida echeverria'
    ),
    (
      v_empresa_id,
      'Maiesy Duisit',
      '0971784122',
      NULL,
      'maiesy duisit'
    ),
    (
      v_empresa_id,
      'Maiko Wiebe',
      NULL,
      NULL,
      'maiko wiebe'
    ),
    (
      v_empresa_id,
      'Maira ayala',
      '0994151600',
      '10mil',
      'maira ayala'
    ),
    (
      v_empresa_id,
      'Maira Benitez',
      '0984156370',
      NULL,
      'maira benitez'
    ),
    (
      v_empresa_id,
      'Maira Capdevila',
      '0971152454',
      NULL,
      'maira capdevila'
    ),
    (
      v_empresa_id,
      'Maira Coronel',
      '0982132524',
      NULL,
      'maira coronel'
    ),
    (
      v_empresa_id,
      'Maira Maldonado',
      '0986905619',
      NULL,
      'maira maldonado'
    ),
    (
      v_empresa_id,
      'Maira Pappalardo',
      '0971943956',
      '10mil',
      'maira pappalardo'
    ),
    (
      v_empresa_id,
      'Maira Sanabria',
      '0972848436',
      NULL,
      'maira sanabria'
    ),
    (
      v_empresa_id,
      'Maira Vallejos',
      '0974288833',
      NULL,
      'maira vallejos'
    ),
    (
      v_empresa_id,
      'Maira Vega',
      '0975153157',
      '1 selo (1)',
      'maira vega'
    ),
    (
      v_empresa_id,
      'Maira Zelaya',
      '0981526752',
      '1 selo (1)',
      'maira zelaya'
    ),
    (
      v_empresa_id,
      'Majo Avalos',
      '0971949970',
      NULL,
      'majo avalos'
    ),
    (
      v_empresa_id,
      'Malena Alvarez',
      '0982344135',
      NULL,
      'malena alvarez'
    ),
    (
      v_empresa_id,
      'Malu Beenal',
      '0981214473',
      NULL,
      'malu beenal'
    ),
    (
      v_empresa_id,
      'Malu Bernal',
      '0981214473',
      NULL,
      'malu bernal'
    ),
    (
      v_empresa_id,
      'Manuel Escurra',
      '0981269544',
      NULL,
      'manuel escurra'
    ),
    (
      v_empresa_id,
      'Manuela Garcia',
      '0981496087',
      NULL,
      'manuela garcia'
    ),
    (
      v_empresa_id,
      'Manuela kauenhowen',
      '0981201565',
      NULL,
      'manuela kauenhowen'
    ),
    (
      v_empresa_id,
      'Manuelita Alonso',
      '0961386451',
      NULL,
      'manuelita alonso'
    ),
    (
      v_empresa_id,
      'Mara Benitez',
      '0972124273',
      NULL,
      'mara benitez'
    ),
    (
      v_empresa_id,
      'Mara Cantero',
      '0985955565',
      '10mil',
      'mara cantero'
    ),
    (
      v_empresa_id,
      'Mara Ferreira',
      '0994533843',
      NULL,
      'mara ferreira'
    ),
    (
      v_empresa_id,
      'Mara Gomez',
      '0982285455',
      '20mil',
      'mara gomez'
    ),
    (
      v_empresa_id,
      'Mara Guerrero',
      '0983378169',
      NULL,
      'mara guerrero'
    ),
    (
      v_empresa_id,
      'Mara Morel',
      '0974321261',
      NULL,
      'mara morel'
    ),
    (
      v_empresa_id,
      'Mara Recalde',
      '0986539309',
      NULL,
      'mara recalde'
    ),
    (
      v_empresa_id,
      'Mara Rojas',
      '0983211653',
      NULL,
      'mara rojas'
    ),
    (
      v_empresa_id,
      'Mara Sugastii',
      '0985675572',
      NULL,
      'mara sugastii'
    ),
    (
      v_empresa_id,
      'Mara Veron',
      NULL,
      NULL,
      'mara veron'
    ),
    (
      v_empresa_id,
      'Marcedes Caceres',
      '0992310547',
      NULL,
      'marcedes caceres'
    ),
    (
      v_empresa_id,
      'Marcela Borga',
      '0991815997',
      NULL,
      'marcela borga'
    ),
    (
      v_empresa_id,
      'Marcela Borja',
      '0991815997',
      NULL,
      'marcela borja'
    ),
    (
      v_empresa_id,
      'Marcela Britos',
      '0971361886',
      '20mil',
      'marcela britos'
    ),
    (
      v_empresa_id,
      'Marcela Canhiza',
      '0984080838',
      NULL,
      'marcela canhiza'
    ),
    (
      v_empresa_id,
      'Marcela Mendieta',
      '0986611653',
      NULL,
      'marcela mendieta'
    ),
    (
      v_empresa_id,
      'Marcela Reyes',
      '0984289982',
      NULL,
      'marcela reyes'
    ),
    (
      v_empresa_id,
      'Marcela Torres',
      '0982767136',
      NULL,
      'marcela torres'
    ),
    (
      v_empresa_id,
      'Marcelo Alvarez',
      '0981526972',
      NULL,
      'marcelo alvarez'
    ),
    (
      v_empresa_id,
      'Marcelo Arce',
      '0971701714',
      NULL,
      'marcelo arce'
    ),
    (
      v_empresa_id,
      'Marcelo Brosky',
      NULL,
      NULL,
      'marcelo brosky'
    ),
    (
      v_empresa_id,
      'Marcelo Esquivel',
      '0982477632',
      NULL,
      'marcelo esquivel'
    ),
    (
      v_empresa_id,
      'Marcelo Lopez',
      '0971688388',
      NULL,
      'marcelo lopez'
    ),
    (
      v_empresa_id,
      'Marcelo Rodriguez',
      '0983102397',
      NULL,
      'marcelo rodriguez'
    ),
    (
      v_empresa_id,
      'Marcelo Rolon',
      '0975161116',
      '1 selo (1)',
      'marcelo rolon'
    ),
    (
      v_empresa_id,
      'Marcia Acosta',
      '0985989762',
      NULL,
      'marcia acosta'
    ),
    (
      v_empresa_id,
      'Marcia Chavez',
      '0981295793',
      NULL,
      'marcia chavez'
    ),
    (
      v_empresa_id,
      'Marcia Lopez',
      '0981792255',
      NULL,
      'marcia lopez'
    ),
    (
      v_empresa_id,
      'Marco Aponte',
      '0981104170',
      NULL,
      'marco aponte'
    ),
    (
      v_empresa_id,
      'Marcos Gimenez',
      '0984158371',
      NULL,
      'marcos gimenez'
    ),
    (
      v_empresa_id,
      'Marcos Lopez',
      '0971109024',
      NULL,
      'marcos lopez'
    ),
    (
      v_empresa_id,
      'Marcos Marmolejo',
      '0986428546',
      '1 selo (2)',
      'marcos marmolejo'
    ),
    (
      v_empresa_id,
      'Marcos Romero',
      '0985810947',
      '1 selo (1)',
      'marcos romero'
    ),
    (
      v_empresa_id,
      'Marelene Escobar',
      NULL,
      NULL,
      'marelene escobar'
    ),
    (
      v_empresa_id,
      'Marelene Romero',
      '0981242179',
      NULL,
      'marelene romero'
    ),
    (
      v_empresa_id,
      'Maren Baltel',
      '0985429093',
      '10MIL',
      'maren baltel'
    ),
    (
      v_empresa_id,
      'Marga Ortega',
      '0971660126',
      NULL,
      'marga ortega'
    ),
    (
      v_empresa_id,
      'Margarita',
      '0983973857',
      NULL,
      'margarita'
    ),
    (
      v_empresa_id,
      'Margarita Alvarez',
      '0984566076',
      NULL,
      'margarita alvarez'
    ),
    (
      v_empresa_id,
      'Margarita Gonzalez',
      '0981086490',
      NULL,
      'margarita gonzalez'
    ),
    (
      v_empresa_id,
      'Margarita Jimenez',
      '0981656965',
      NULL,
      'margarita jimenez'
    ),
    (
      v_empresa_id,
      'Margarita Morales',
      '0972881833',
      NULL,
      'margarita morales'
    ),
    (
      v_empresa_id,
      'Margarita Riquelme',
      '0981905772',
      '20mil',
      'margarita riquelme'
    ),
    (
      v_empresa_id,
      'Mari Dominguez',
      '0982111564',
      NULL,
      'mari dominguez'
    ),
    (
      v_empresa_id,
      'Mari Paz',
      '0985905374',
      NULL,
      'mari paz'
    ),
    (
      v_empresa_id,
      'Maria',
      NULL,
      NULL,
      'maria'
    ),
    (
      v_empresa_id,
      'Maria Acevedo',
      '0972589500',
      NULL,
      'maria acevedo'
    ),
    (
      v_empresa_id,
      'Maria Acha',
      '0981246419',
      NULL,
      'maria acha'
    ),
    (
      v_empresa_id,
      'Maria Adorno',
      '0985166504',
      NULL,
      'maria adorno'
    ),
    (
      v_empresa_id,
      'Maria Aguiar',
      '0982567662',
      NULL,
      'maria aguiar'
    ),
    (
      v_empresa_id,
      'Maria Alderete',
      '0992534028',
      NULL,
      'maria alderete'
    ),
    (
      v_empresa_id,
      'Maria Alejandra',
      '0994201316',
      NULL,
      'maria alejandra'
    ),
    (
      v_empresa_id,
      'Maria Alejandra Duarte',
      '0982100602',
      NULL,
      'maria alejandra duarte'
    ),
    (
      v_empresa_id,
      'Maria Allende',
      '0992994004',
      NULL,
      'maria allende'
    ),
    (
      v_empresa_id,
      'Maria Alvarenga',
      '0991279046',
      NULL,
      'maria alvarenga'
    ),
    (
      v_empresa_id,
      'Maria Alvarez',
      '0984715559',
      NULL,
      'maria alvarez'
    ),
    (
      v_empresa_id,
      'Maria Angel Barrios',
      '0982522520',
      '1 selo (1)',
      'maria angel barrios'
    ),
    (
      v_empresa_id,
      'Maria Angela Benitez',
      '0982439799',
      NULL,
      'maria angela benitez'
    ),
    (
      v_empresa_id,
      'Maria Arias',
      '0981113549',
      NULL,
      'maria arias'
    ),
    (
      v_empresa_id,
      'Maria Avalos',
      '0992575062',
      NULL,
      'maria avalos'
    ),
    (
      v_empresa_id,
      'Maria Avila Gimenez',
      '0975661569',
      NULL,
      'maria avila gimenez'
    ),
    (
      v_empresa_id,
      'Maria Azucena Prieto',
      '0981847609',
      NULL,
      'maria azucena prieto'
    ),
    (
      v_empresa_id,
      'Maria Baez',
      '0983175105',
      NULL,
      'maria baez'
    ),
    (
      v_empresa_id,
      'Maria Balbuena',
      '0984824139',
      NULL,
      'maria balbuena'
    ),
    (
      v_empresa_id,
      'Maria Barboza',
      '0981756450',
      NULL,
      'maria barboza'
    ),
    (
      v_empresa_id,
      'Maria Barreto',
      '0982123490',
      '10mil',
      'maria barreto'
    ),
    (
      v_empresa_id,
      'Maria Barrientos',
      '0995672880',
      NULL,
      'maria barrientos'
    ),
    (
      v_empresa_id,
      'Maria Belen Arellaga',
      '0994978664',
      NULL,
      'maria belen arellaga'
    ),
    (
      v_empresa_id,
      'Maria Belen Catro',
      '0972511752',
      '20mil',
      'maria belen catro'
    ),
    (
      v_empresa_id,
      'Maria Belen Gimenez',
      '0973707894',
      NULL,
      'maria belen gimenez'
    ),
    (
      v_empresa_id,
      'Maria Belen Glits',
      '0971597861',
      NULL,
      'maria belen glits'
    ),
    (
      v_empresa_id,
      'Maria Belen Marin',
      '0975396961',
      NULL,
      'maria belen marin'
    ),
    (
      v_empresa_id,
      'Maria Belen Saldivar Martinez',
      '0986197452',
      NULL,
      'maria belen saldivar martinez'
    ),
    (
      v_empresa_id,
      'Maria Belen Villalba',
      '0986149122',
      '20mil',
      'maria belen villalba'
    ),
    (
      v_empresa_id,
      'Maria Belgara',
      '0985924961',
      NULL,
      'maria belgara'
    ),
    (
      v_empresa_id,
      'Maria Benitez',
      '0971506357',
      '10mil',
      'maria benitez'
    ),
    (
      v_empresa_id,
      'Maria Bogado',
      '0976560701',
      '20MIL',
      'maria bogado'
    ),
    (
      v_empresa_id,
      'Maria Borja',
      '0982188256',
      NULL,
      'maria borja'
    ),
    (
      v_empresa_id,
      'Maria Britez',
      '0983676609',
      '10mil',
      'maria britez'
    ),
    (
      v_empresa_id,
      'maria caballero',
      '0972739994',
      '1 (selo)',
      'maria caballero'
    ),
    (
      v_empresa_id,
      'Maria Cabrera',
      '0991867365',
      NULL,
      'maria cabrera'
    ),
    (
      v_empresa_id,
      'Maria Caceres',
      '0984517184',
      '10mil',
      'maria caceres'
    ),
    (
      v_empresa_id,
      'Maria Carvallo',
      '0993540100',
      '1 selo (1)',
      'maria carvallo'
    ),
    (
      v_empresa_id,
      'Maria Cecilia Gonzalez',
      '0971707452',
      NULL,
      'maria cecilia gonzalez'
    ),
    (
      v_empresa_id,
      'Maria Chaves',
      '0993329035',
      NULL,
      'maria chaves'
    ),
    (
      v_empresa_id,
      'Maria Cristina Paredes',
      '0972775729',
      NULL,
      'maria cristina paredes'
    ),
    (
      v_empresa_id,
      'Maria Cristina Udrizar',
      '0984326356',
      NULL,
      'maria cristina udrizar'
    ),
    (
      v_empresa_id,
      'Maria del Carmen Armoa',
      '0982744904',
      NULL,
      'maria del carmen armoa'
    ),
    (
      v_empresa_id,
      'Maria del Pilar Cabral',
      '0992972227',
      '1 selo (1)',
      'maria del pilar cabral'
    ),
    (
      v_empresa_id,
      'Maria Deme stral',
      '0971736688',
      NULL,
      'maria deme stral'
    ),
    (
      v_empresa_id,
      'Maria Diaz',
      '0992886255',
      NULL,
      'maria diaz'
    ),
    (
      v_empresa_id,
      'Maria Dolly',
      '0975912446',
      NULL,
      'maria dolly'
    ),
    (
      v_empresa_id,
      'Maria Duarte',
      '0986735769',
      NULL,
      'maria duarte'
    ),
    (
      v_empresa_id,
      'Maria Elena Galeano',
      '0991166761',
      NULL,
      'maria elena galeano'
    ),
    (
      v_empresa_id,
      'Maria Elena Ruiz',
      '0981248091',
      '10mil',
      'maria elena ruiz'
    ),
    (
      v_empresa_id,
      'Maria Elis Servian',
      '0994357568',
      NULL,
      'maria elis servian'
    ),
    (
      v_empresa_id,
      'Maria Elizabeth Ojeda',
      '0981617889',
      '20mil',
      'maria elizabeth ojeda'
    ),
    (
      v_empresa_id,
      'Maria Emilia',
      '0981246419',
      NULL,
      'maria emilia'
    ),
    (
      v_empresa_id,
      'Maria Escrish',
      '0981998414',
      NULL,
      'maria escrish'
    ),
    (
      v_empresa_id,
      'Maria Espinola',
      '0985337801',
      NULL,
      'maria espinola'
    ),
    (
      v_empresa_id,
      'Maria Espinosa',
      '0976656890',
      NULL,
      'maria espinosa'
    ),
    (
      v_empresa_id,
      'Maria Estela Gamarra',
      '0981238863',
      '10mil',
      'maria estela gamarra'
    ),
    (
      v_empresa_id,
      'Maria Ester',
      '0981121715',
      NULL,
      'maria ester'
    ),
    (
      v_empresa_id,
      'Maria Eugenia',
      '0981217118',
      NULL,
      'maria eugenia'
    ),
    (
      v_empresa_id,
      'Maria Eugenia Garcia',
      '0981217118',
      NULL,
      'maria eugenia garcia'
    ),
    (
      v_empresa_id,
      'Maria Eugenia Larroza',
      '0961537413',
      NULL,
      'maria eugenia larroza'
    ),
    (
      v_empresa_id,
      'Maria Eugenia Villalba',
      '0981403191',
      NULL,
      'maria eugenia villalba'
    ),
    (
      v_empresa_id,
      'Maria Farina',
      '0971728665',
      '20MIL',
      'maria farina'
    ),
    (
      v_empresa_id,
      'Maria Fernanda Aguero',
      '0981219278',
      NULL,
      'maria fernanda aguero'
    ),
    (
      v_empresa_id,
      'Maria Fernanda Caceres',
      '0982362329',
      '1 SELO (1)',
      'maria fernanda caceres'
    ),
    (
      v_empresa_id,
      'Maria Fernanda Portillo',
      '0993531200',
      NULL,
      'maria fernanda portillo'
    ),
    (
      v_empresa_id,
      'Maria Fernandes',
      '0986793446',
      NULL,
      'maria fernandes'
    ),
    (
      v_empresa_id,
      'Maria Fernandez',
      '0983317507',
      NULL,
      'maria fernandez'
    ),
    (
      v_empresa_id,
      'Maria Ferrer',
      '0994303098',
      NULL,
      'maria ferrer'
    ),
    (
      v_empresa_id,
      'Maria Fleitas',
      '0981144069',
      NULL,
      'maria fleitas'
    ),
    (
      v_empresa_id,
      'Maria Fleytas',
      '0981159396',
      NULL,
      'maria fleytas'
    ),
    (
      v_empresa_id,
      'Maria Flores',
      '0983347301',
      NULL,
      'maria flores'
    ),
    (
      v_empresa_id,
      'Maria Franco',
      '99288030',
      NULL,
      'maria franco'
    ),
    (
      v_empresa_id,
      'Maria Gabriela Medina',
      '0983478844',
      NULL,
      'maria gabriela medina'
    ),
    (
      v_empresa_id,
      'Maria Galeano',
      '0981641936',
      NULL,
      'maria galeano'
    ),
    (
      v_empresa_id,
      'Maria Garandal',
      '0986530151',
      NULL,
      'maria garandal'
    ),
    (
      v_empresa_id,
      'Maria Garay',
      '0986717356',
      NULL,
      'maria garay'
    ),
    (
      v_empresa_id,
      'Maria Garza',
      '0981482665',
      NULL,
      'maria garza'
    ),
    (
      v_empresa_id,
      'Maria Gimenez',
      '0994256950',
      NULL,
      'maria gimenez'
    ),
    (
      v_empresa_id,
      'Maria Golla',
      '0973147171',
      NULL,
      'maria golla'
    ),
    (
      v_empresa_id,
      'Maria Gomez',
      '0985365400',
      NULL,
      'maria gomez'
    ),
    (
      v_empresa_id,
      'Maria Gonzalez',
      '0985613473',
      NULL,
      'maria gonzalez'
    ),
    (
      v_empresa_id,
      'Maria Gonzalez Vera',
      '0982231079',
      NULL,
      'maria gonzalez vera'
    ),
    (
      v_empresa_id,
      'Maria Guerrera',
      '0982402508',
      NULL,
      'maria guerrera'
    ),
    (
      v_empresa_id,
      'Maria Helena Olivetti',
      '0995392041',
      NULL,
      'maria helena olivetti'
    ),
    (
      v_empresa_id,
      'Maria Herrera',
      '0994549351',
      NULL,
      'maria herrera'
    ),
    (
      v_empresa_id,
      'Maria Hidalgo',
      '0982200997',
      NULL,
      'maria hidalgo'
    ),
    (
      v_empresa_id,
      'Maria Ibarra',
      '0981215661',
      NULL,
      'maria ibarra'
    ),
    (
      v_empresa_id,
      'Maria Jara',
      '0981370774',
      NULL,
      'maria jara'
    ),
    (
      v_empresa_id,
      'Maria Jesus Gomez',
      '0991903549',
      '10mil',
      'maria jesus gomez'
    ),
    (
      v_empresa_id,
      'Maria Jose',
      '0984491206',
      NULL,
      'maria jose'
    ),
    (
      v_empresa_id,
      'Maria Jose Achucarro',
      '0984491206',
      NULL,
      'maria jose achucarro'
    ),
    (
      v_empresa_id,
      'Maria Jose Acosta',
      '0971798224',
      '20mil',
      'maria jose acosta'
    ),
    (
      v_empresa_id,
      'Maria Jose Avalos',
      '0971949970',
      NULL,
      'maria jose avalos'
    ),
    (
      v_empresa_id,
      'Maria Jose Benitez',
      '0995699773',
      '1 selo (1)',
      'maria jose benitez'
    ),
    (
      v_empresa_id,
      'Maria Jose Cabanas',
      '0981942936',
      NULL,
      'maria jose cabanas'
    ),
    (
      v_empresa_id,
      'Maria Jose Cabanhas',
      '0981942936',
      NULL,
      'maria jose cabanhas'
    ),
    (
      v_empresa_id,
      'Maria Jose Caceres',
      '0982135658',
      NULL,
      'maria jose caceres'
    ),
    (
      v_empresa_id,
      'Maria Jose Ceccoli',
      '0971339115',
      NULL,
      'maria jose ceccoli'
    ),
    (
      v_empresa_id,
      'Maria Jose Di Pardo',
      '0991214067',
      '10mil',
      'maria jose di pardo'
    ),
    (
      v_empresa_id,
      'Maria Jose Diaz',
      '0984182877',
      NULL,
      'maria jose diaz'
    ),
    (
      v_empresa_id,
      'Maria Jose Duarte',
      '0982932691',
      NULL,
      'maria jose duarte'
    ),
    (
      v_empresa_id,
      'Maria Jose Espinola',
      '99478123',
      NULL,
      'maria jose espinola'
    ),
    (
      v_empresa_id,
      'Maria Jose Farina',
      '0972402925',
      NULL,
      'maria jose farina'
    ),
    (
      v_empresa_id,
      'Maria Jose Fernandez',
      '0983197114',
      '30mil',
      'maria jose fernandez'
    ),
    (
      v_empresa_id,
      'Maria Jose Gamorro',
      '0994522026',
      NULL,
      'maria jose gamorro'
    ),
    (
      v_empresa_id,
      'Maria Jose Gomez',
      '0972196387',
      NULL,
      'maria jose gomez'
    ),
    (
      v_empresa_id,
      'Maria Jose Gonzalez',
      '0983516776',
      NULL,
      'maria jose gonzalez'
    ),
    (
      v_empresa_id,
      'Maria Jose Isasis',
      '0983386226',
      NULL,
      'maria jose isasis'
    ),
    (
      v_empresa_id,
      'Maria Jose Mena',
      '0974718263',
      NULL,
      'maria jose mena'
    ),
    (
      v_empresa_id,
      'Maria jose Montti',
      '0983911541',
      NULL,
      'maria jose montti'
    ),
    (
      v_empresa_id,
      'Maria Jose Ojeda',
      '0985189141',
      NULL,
      'maria jose ojeda'
    ),
    (
      v_empresa_id,
      'Maria Jose Ramirez',
      '0981157200',
      NULL,
      'maria jose ramirez'
    ),
    (
      v_empresa_id,
      'Maria Jose Rojas',
      '0983789143',
      NULL,
      'maria jose rojas'
    ),
    (
      v_empresa_id,
      'Maria Jose Sandoval',
      '0976941984',
      NULL,
      'maria jose sandoval'
    ),
    (
      v_empresa_id,
      'Maria Jose Sosa',
      '0992408147',
      '1 selo (1)',
      'maria jose sosa'
    ),
    (
      v_empresa_id,
      'Maria Jose Velazquez',
      '0971693773',
      '10mil',
      'maria jose velazquez'
    ),
    (
      v_empresa_id,
      'Maria Laura Paez',
      '0984322641',
      NULL,
      'maria laura paez'
    ),
    (
      v_empresa_id,
      'Maria Ledezma',
      '0991633130',
      NULL,
      'maria ledezma'
    ),
    (
      v_empresa_id,
      'Maria Leon',
      NULL,
      NULL,
      'maria leon'
    ),
    (
      v_empresa_id,
      'Maria Leticia',
      '0991841277',
      NULL,
      'maria leticia'
    ),
    (
      v_empresa_id,
      'Maria Leticia Gonzalez',
      '0994823451',
      NULL,
      'maria leticia gonzalez'
    ),
    (
      v_empresa_id,
      'Maria Licet',
      '0992499763',
      '10mil',
      'maria licet'
    ),
    (
      v_empresa_id,
      'Maria Liz',
      '0982974489',
      NULL,
      'maria liz'
    ),
    (
      v_empresa_id,
      'Maria Liz Alvarenga',
      '0991279046',
      NULL,
      'maria liz alvarenga'
    ),
    (
      v_empresa_id,
      'Maria Liz Benites',
      '0982133695',
      '10MIL',
      'maria liz benites'
    ),
    (
      v_empresa_id,
      'Maria Liz Fonseca',
      '0981600124',
      NULL,
      'maria liz fonseca'
    ),
    (
      v_empresa_id,
      'Maria Liz Servian',
      '0994357568',
      NULL,
      'maria liz servian'
    ),
    (
      v_empresa_id,
      'Maria Llano',
      '0971918528',
      NULL,
      'maria llano'
    ),
    (
      v_empresa_id,
      'Maria Lucia Argance',
      '0982351069',
      NULL,
      'maria lucia argance'
    ),
    (
      v_empresa_id,
      'Maria Luisa Granse',
      '0982351069',
      NULL,
      'maria luisa granse'
    ),
    (
      v_empresa_id,
      'Maria Luisa Lopez',
      '0986449707',
      NULL,
      'maria luisa lopez'
    ),
    (
      v_empresa_id,
      'Maria Luisa Villamayor',
      '0991669875',
      NULL,
      'maria luisa villamayor'
    ),
    (
      v_empresa_id,
      'Maria Lujan Salinas',
      '0991264600',
      NULL,
      'maria lujan salinas'
    ),
    (
      v_empresa_id,
      'Maria Luz Peralta',
      '0982430827',
      NULL,
      'maria luz peralta'
    ),
    (
      v_empresa_id,
      'Maria Maciel',
      '0992884949',
      NULL,
      'maria maciel'
    ),
    (
      v_empresa_id,
      'Maria Marlena',
      '0984520587',
      NULL,
      'maria marlena'
    ),
    (
      v_empresa_id,
      'Maria Martinez',
      '0984439307',
      NULL,
      'maria martinez'
    ),
    (
      v_empresa_id,
      'Maria Melgarejo',
      '0983920201',
      '1 selo (1)',
      'maria melgarejo'
    ),
    (
      v_empresa_id,
      'Maria Mercedes Salinas',
      '0983335420',
      '10mil',
      'maria mercedes salinas'
    ),
    (
      v_empresa_id,
      'Maria Mieres',
      '0981592263',
      NULL,
      'maria mieres'
    ),
    (
      v_empresa_id,
      'Maria Miranda',
      '0991684604',
      NULL,
      'maria miranda'
    ),
    (
      v_empresa_id,
      'Maria Miranda Doria',
      '0991684604',
      NULL,
      'maria miranda doria'
    ),
    (
      v_empresa_id,
      'Maria Monges',
      '0986716972',
      NULL,
      'maria monges'
    ),
    (
      v_empresa_id,
      'Maria Morel',
      '0982880308',
      NULL,
      'maria morel'
    ),
    (
      v_empresa_id,
      'Maria Ocampos',
      '0983164793',
      NULL,
      'maria ocampos'
    ),
    (
      v_empresa_id,
      'Maria Ofelia Cassignol',
      '0981417003',
      NULL,
      'maria ofelia cassignol'
    ),
    (
      v_empresa_id,
      'Maria Ojeda',
      '0982257082',
      NULL,
      'maria ojeda'
    ),
    (
      v_empresa_id,
      'Maria Pavon',
      '0982128248',
      '10mil',
      'maria pavon'
    ),
    (
      v_empresa_id,
      'Maria Paz',
      '0985905374',
      '30mil',
      'maria paz'
    ),
    (
      v_empresa_id,
      'Maria Paz Aveiro',
      '99135894',
      '1 selo (5)',
      'maria paz aveiro'
    ),
    (
      v_empresa_id,
      'Maria Paz Barboza',
      '0981756450',
      '30mil',
      'maria paz barboza'
    ),
    (
      v_empresa_id,
      'Maria Paz Dominguez',
      '0981312338',
      NULL,
      'maria paz dominguez'
    ),
    (
      v_empresa_id,
      'Maria Paz Galeano',
      '0991988634',
      NULL,
      'maria paz galeano'
    ),
    (
      v_empresa_id,
      'Maria Paz Guerrero',
      '0981291039',
      '1 selo (1)',
      'maria paz guerrero'
    ),
    (
      v_empresa_id,
      'Maria Paz Montti',
      '0984503047',
      '10 MIL',
      'maria paz montti'
    ),
    (
      v_empresa_id,
      'Maria Paz Vera',
      '0972100871',
      NULL,
      'maria paz vera'
    ),
    (
      v_empresa_id,
      'Maria Peralta',
      '0994314894',
      '40mil',
      'maria peralta'
    ),
    (
      v_empresa_id,
      'Maria Pereira',
      '0982236449',
      NULL,
      'maria pereira'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 8: filas 3501..4000
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Maria Pia Hug',
      '0983772400',
      NULL,
      'maria pia hug'
    ),
    (
      v_empresa_id,
      'Maria Pintos',
      '0994762118',
      '10mil',
      'maria pintos'
    ),
    (
      v_empresa_id,
      'Maria Podaca',
      '0971276772',
      '10mil',
      'maria podaca'
    ),
    (
      v_empresa_id,
      'Maria Portillo',
      '0983522035',
      '1 selo (1)',
      'maria portillo'
    ),
    (
      v_empresa_id,
      'Maria Raquel Ortiz',
      '0971819416',
      '10mil',
      'maria raquel ortiz'
    ),
    (
      v_empresa_id,
      'Maria Recalde',
      '0982005395',
      '30mil',
      'maria recalde'
    ),
    (
      v_empresa_id,
      'Maria Riveros',
      '0985787087',
      NULL,
      'maria riveros'
    ),
    (
      v_empresa_id,
      'Maria Rodas',
      '0971565148',
      NULL,
      'maria rodas'
    ),
    (
      v_empresa_id,
      'Maria Rodriguez',
      '0986471720',
      NULL,
      'maria rodriguez'
    ),
    (
      v_empresa_id,
      'Maria Rojas',
      '0984954152',
      NULL,
      'maria rojas'
    ),
    (
      v_empresa_id,
      'Maria Romina Osorio',
      '0987112016',
      NULL,
      'maria romina osorio'
    ),
    (
      v_empresa_id,
      'Maria Rosa Alvedo',
      '0991739669',
      NULL,
      'maria rosa alvedo'
    ),
    (
      v_empresa_id,
      'Maria Rosa Bordon',
      '0971558018',
      NULL,
      'maria rosa bordon'
    ),
    (
      v_empresa_id,
      'Maria Rosa Leon',
      '0981414896',
      '10MIL',
      'maria rosa leon'
    ),
    (
      v_empresa_id,
      'Maria Rosana',
      '0982502667',
      NULL,
      'maria rosana'
    ),
    (
      v_empresa_id,
      'Maria Ruiz',
      '0981353242',
      '10MIL',
      'maria ruiz'
    ),
    (
      v_empresa_id,
      'Maria Sanabria',
      '0985441828',
      '10mil',
      'maria sanabria'
    ),
    (
      v_empresa_id,
      'Maria Sanchez',
      '0992622436',
      NULL,
      'maria sanchez'
    ),
    (
      v_empresa_id,
      'Maria Santacruz',
      '0981471072',
      NULL,
      'maria santacruz'
    ),
    (
      v_empresa_id,
      'Maria Sol Fernandez',
      '0992997870',
      NULL,
      'maria sol fernandez'
    ),
    (
      v_empresa_id,
      'Maria Sosa',
      '0971940879',
      '10mil',
      'maria sosa'
    ),
    (
      v_empresa_id,
      'Maria Teresa Gomez',
      '0971330300',
      NULL,
      'maria teresa gomez'
    ),
    (
      v_empresa_id,
      'Maria Teresa Noldin',
      '0983877779',
      NULL,
      'maria teresa noldin'
    ),
    (
      v_empresa_id,
      'Maria Teresa Vera',
      '0991544522',
      NULL,
      'maria teresa vera'
    ),
    (
      v_empresa_id,
      'Maria Trinidad',
      '0982097800',
      NULL,
      'maria trinidad'
    ),
    (
      v_empresa_id,
      'Maria Troche',
      '0972174575',
      NULL,
      'maria troche'
    ),
    (
      v_empresa_id,
      'Maria Vazquez',
      '0982186315',
      NULL,
      'maria vazquez'
    ),
    (
      v_empresa_id,
      'Maria Vera',
      '0992565362',
      NULL,
      'maria vera'
    ),
    (
      v_empresa_id,
      'Maria Veronica Morinigo',
      '0992291922',
      NULL,
      'maria veronica morinigo'
    ),
    (
      v_empresa_id,
      'Maria Victoria',
      '0983870205',
      NULL,
      'maria victoria'
    ),
    (
      v_empresa_id,
      'Maria Villalba',
      '0971799951',
      NULL,
      'maria villalba'
    ),
    (
      v_empresa_id,
      'Maria Villamayor',
      NULL,
      NULL,
      'maria villamayor'
    ),
    (
      v_empresa_id,
      'Maria Zamuera',
      '0981517981',
      NULL,
      'maria zamuera'
    ),
    (
      v_empresa_id,
      'Mariam Diaz',
      '0972258870',
      NULL,
      'mariam diaz'
    ),
    (
      v_empresa_id,
      'Mariam Gonzalez',
      '0994251723',
      NULL,
      'mariam gonzalez'
    ),
    (
      v_empresa_id,
      'Mariam Jose Velazquez',
      '0971693773',
      NULL,
      'mariam jose velazquez'
    ),
    (
      v_empresa_id,
      'Mariam Lujan Vera',
      '0972952378',
      NULL,
      'mariam lujan vera'
    ),
    (
      v_empresa_id,
      'Mariam Martinez',
      '0972793715',
      NULL,
      'mariam martinez'
    ),
    (
      v_empresa_id,
      'Mariam Villalba',
      '0994264416',
      NULL,
      'mariam villalba'
    ),
    (
      v_empresa_id,
      'Marian',
      '0993305232',
      NULL,
      'marian'
    ),
    (
      v_empresa_id,
      'Marian Arza',
      '0981482665',
      '20MIL',
      'marian arza'
    ),
    (
      v_empresa_id,
      'Marian Ayala',
      '0985900088',
      NULL,
      'marian ayala'
    ),
    (
      v_empresa_id,
      'Marian Dominguez',
      '0981245335',
      NULL,
      'marian dominguez'
    ),
    (
      v_empresa_id,
      'Marian Garcia',
      '0982384111',
      NULL,
      'marian garcia'
    ),
    (
      v_empresa_id,
      'Marian Martinez',
      '0982489865',
      '1 selo (1)',
      'marian martinez'
    ),
    (
      v_empresa_id,
      'Marian Reyes',
      '0981687801',
      NULL,
      'marian reyes'
    ),
    (
      v_empresa_id,
      'Marian Riveros',
      '0976546998',
      NULL,
      'marian riveros'
    ),
    (
      v_empresa_id,
      'Marian Romero',
      '0972785848',
      NULL,
      'marian romero'
    ),
    (
      v_empresa_id,
      'Marian Unruh',
      '0982745164',
      NULL,
      'marian unruh'
    ),
    (
      v_empresa_id,
      'Marian Yegros',
      '0994672409',
      NULL,
      'marian yegros'
    ),
    (
      v_empresa_id,
      'Mariana Anonelli',
      '0982798402',
      '10mil',
      'mariana anonelli'
    ),
    (
      v_empresa_id,
      'Mariana AnTonelli',
      '0982798402',
      NULL,
      'mariana antonelli'
    ),
    (
      v_empresa_id,
      'Mariana Arrua',
      '0971869861',
      NULL,
      'mariana arrua'
    ),
    (
      v_empresa_id,
      'Mariana Barreto',
      '0981218724',
      NULL,
      'mariana barreto'
    ),
    (
      v_empresa_id,
      'Mariana Chaves',
      '0981987029',
      NULL,
      'mariana chaves'
    ),
    (
      v_empresa_id,
      'Mariana Fleitas',
      '0994168430',
      NULL,
      'mariana fleitas'
    ),
    (
      v_empresa_id,
      'Mariana Lutianika',
      '0975772651',
      NULL,
      'mariana lutianika'
    ),
    (
      v_empresa_id,
      'Mariana Lutienica',
      '0975772651',
      NULL,
      'mariana lutienica'
    ),
    (
      v_empresa_id,
      'Mariana Nicolle',
      '0985504513',
      NULL,
      'mariana nicolle'
    ),
    (
      v_empresa_id,
      'Mariana Oliveira',
      '0985295445',
      '40mil',
      'mariana oliveira'
    ),
    (
      v_empresa_id,
      'Mariana Sanchez',
      '0985666432',
      NULL,
      'mariana sanchez'
    ),
    (
      v_empresa_id,
      'Mariana Silvera',
      '0983115935',
      NULL,
      'mariana silvera'
    ),
    (
      v_empresa_id,
      'Mariana Sosa',
      '0991928087',
      NULL,
      'mariana sosa'
    ),
    (
      v_empresa_id,
      'Marianne Petit',
      '0981531117',
      '10MIL',
      'marianne petit'
    ),
    (
      v_empresa_id,
      'Mariano',
      NULL,
      NULL,
      'mariano'
    ),
    (
      v_empresa_id,
      'Mariano Bilek',
      '0992254492',
      NULL,
      'mariano bilek'
    ),
    (
      v_empresa_id,
      'Mariano Cantero',
      '0985142324',
      '1 selo (1)',
      'mariano cantero'
    ),
    (
      v_empresa_id,
      'Maribel Chavez',
      '0972953809',
      NULL,
      'maribel chavez'
    ),
    (
      v_empresa_id,
      'Maribel Espinola',
      '0985382482',
      NULL,
      'maribel espinola'
    ),
    (
      v_empresa_id,
      'Marible Quintana',
      '0992787809',
      NULL,
      'marible quintana'
    ),
    (
      v_empresa_id,
      'Maricel Torres',
      '0992245510',
      NULL,
      'maricel torres'
    ),
    (
      v_empresa_id,
      'Mariel Fleita',
      '0991407961',
      NULL,
      'mariel fleita'
    ),
    (
      v_empresa_id,
      'Mariel Gomez',
      '0981087414',
      NULL,
      'mariel gomez'
    ),
    (
      v_empresa_id,
      'Mariel Leon',
      '0994138484',
      NULL,
      'mariel leon'
    ),
    (
      v_empresa_id,
      'Mariela Abila',
      '0982168639',
      NULL,
      'mariela abila'
    ),
    (
      v_empresa_id,
      'Mariela Barboza',
      '0981177861',
      NULL,
      'mariela barboza'
    ),
    (
      v_empresa_id,
      'Mariela Benitez',
      '0981838871',
      NULL,
      'mariela benitez'
    ),
    (
      v_empresa_id,
      'Mariela Brites',
      '0981287826',
      NULL,
      'mariela brites'
    ),
    (
      v_empresa_id,
      'Mariela Britez',
      '0981287826',
      NULL,
      'mariela britez'
    ),
    (
      v_empresa_id,
      'Mariela Brizuela',
      '0991906092',
      NULL,
      'mariela brizuela'
    ),
    (
      v_empresa_id,
      'Mariela Centurion',
      '0992444975',
      NULL,
      'mariela centurion'
    ),
    (
      v_empresa_id,
      'Mariela Cespedes',
      '0982600443',
      NULL,
      'mariela cespedes'
    ),
    (
      v_empresa_id,
      'Mariela Gamarro',
      '0986309040',
      NULL,
      'mariela gamarro'
    ),
    (
      v_empresa_id,
      'Mariela Gauto',
      '0981211809',
      '1 selo (2)',
      'mariela gauto'
    ),
    (
      v_empresa_id,
      'Mariela Gonzalez',
      '0991993043',
      NULL,
      'mariela gonzalez'
    ),
    (
      v_empresa_id,
      'Mariela Guillen',
      '0971351622',
      NULL,
      'mariela guillen'
    ),
    (
      v_empresa_id,
      'Mariela Hermosilla',
      '0961976911',
      NULL,
      'mariela hermosilla'
    ),
    (
      v_empresa_id,
      'Mariela Pita',
      '0983443594',
      NULL,
      'mariela pita'
    ),
    (
      v_empresa_id,
      'Mariela Pitta',
      '0983443594',
      NULL,
      'mariela pitta'
    ),
    (
      v_empresa_id,
      'Mariela Quinon',
      '0994327079',
      NULL,
      'mariela quinon'
    ),
    (
      v_empresa_id,
      'Mariela Rolon',
      '0981117107',
      NULL,
      'mariela rolon'
    ),
    (
      v_empresa_id,
      'Mariela Rosa',
      '0986181094',
      NULL,
      'mariela rosa'
    ),
    (
      v_empresa_id,
      'Mariela Sanabria',
      '0984752876',
      NULL,
      'mariela sanabria'
    ),
    (
      v_empresa_id,
      'Mariela Valdez',
      '0971262664',
      '1 selo (1)',
      'mariela valdez'
    ),
    (
      v_empresa_id,
      'Mariela Vazquez',
      '0982385356',
      '10MIL',
      'mariela vazquez'
    ),
    (
      v_empresa_id,
      'Marilene Machado',
      '0976425145',
      NULL,
      'marilene machado'
    ),
    (
      v_empresa_id,
      'Marilia Ramos',
      '0992786909',
      NULL,
      'marilia ramos'
    ),
    (
      v_empresa_id,
      'Marina Aquino',
      '0994441016',
      NULL,
      'marina aquino'
    ),
    (
      v_empresa_id,
      'Marina Dominguez',
      '0985239865',
      NULL,
      'marina dominguez'
    ),
    (
      v_empresa_id,
      'Marina Gomez',
      '0994650790',
      NULL,
      'marina gomez'
    ),
    (
      v_empresa_id,
      'Marina Sanchez',
      '0981457599',
      NULL,
      'marina sanchez'
    ),
    (
      v_empresa_id,
      'Mario Dominguez',
      '0982144147',
      NULL,
      'mario dominguez'
    ),
    (
      v_empresa_id,
      'Mario Seifara',
      '0981224186',
      NULL,
      'mario seifara'
    ),
    (
      v_empresa_id,
      'Marion Ibet',
      '0986430739',
      NULL,
      'marion ibet'
    ),
    (
      v_empresa_id,
      'Maripaz Martinez',
      '0985905374',
      NULL,
      'maripaz martinez'
    ),
    (
      v_empresa_id,
      'Marisa fehr',
      '0983258290',
      '2 selos (2)',
      'marisa fehr'
    ),
    (
      v_empresa_id,
      'Marisa Wall',
      '0983997480',
      NULL,
      'marisa wall'
    ),
    (
      v_empresa_id,
      'Marisel Echeverria',
      '0982815473',
      '20mil',
      'marisel echeverria'
    ),
    (
      v_empresa_id,
      'Marisela Lopez',
      '0991199000',
      NULL,
      'marisela lopez'
    ),
    (
      v_empresa_id,
      'Marisol Grans',
      '0981198531',
      NULL,
      'marisol grans'
    ),
    (
      v_empresa_id,
      'Marisol Romero',
      '0981676723',
      NULL,
      'marisol romero'
    ),
    (
      v_empresa_id,
      'Marisol Viera',
      '0971447610',
      '10MIL',
      'marisol viera'
    ),
    (
      v_empresa_id,
      'Mariza Duarte',
      '0971951158',
      NULL,
      'mariza duarte'
    ),
    (
      v_empresa_id,
      'Mariza Idala Martinez',
      '0985128273',
      NULL,
      'mariza idala martinez'
    ),
    (
      v_empresa_id,
      'Marlene Aguero',
      '0974459592',
      '30mil',
      'marlene aguero'
    ),
    (
      v_empresa_id,
      'Marlene Amarilla',
      '0982557053',
      NULL,
      'marlene amarilla'
    ),
    (
      v_empresa_id,
      'Marlene Espinoza de Cabrera',
      '0991549527',
      '20MIL',
      'marlene espinoza de cabrera'
    ),
    (
      v_empresa_id,
      'Marlene Fretes',
      '0982591995',
      NULL,
      'marlene fretes'
    ),
    (
      v_empresa_id,
      'Marlene Gimenez',
      '0982004574',
      NULL,
      'marlene gimenez'
    ),
    (
      v_empresa_id,
      'Marlene Jara',
      '0973581082',
      NULL,
      'marlene jara'
    ),
    (
      v_empresa_id,
      'Marlene Maldonado',
      '0961245463',
      NULL,
      'marlene maldonado'
    ),
    (
      v_empresa_id,
      'Marlene Peralta',
      '0994452009',
      NULL,
      'marlene peralta'
    ),
    (
      v_empresa_id,
      'Marlene Romero',
      '0981242179',
      NULL,
      'marlene romero'
    ),
    (
      v_empresa_id,
      'Marlene Schroreder',
      '0972401649',
      NULL,
      'marlene schroreder'
    ),
    (
      v_empresa_id,
      'Marlene Villagra',
      '0981726661',
      NULL,
      'marlene villagra'
    ),
    (
      v_empresa_id,
      'Marli Anzotegui',
      '0994839308',
      NULL,
      'marli anzotegui'
    ),
    (
      v_empresa_id,
      'Marli Pedrozo',
      '0994239613',
      '1 selo (1)',
      'marli pedrozo'
    ),
    (
      v_empresa_id,
      'Marly Gimenez',
      '0972429413',
      NULL,
      'marly gimenez'
    ),
    (
      v_empresa_id,
      'Marlyn Noguera',
      '0991853815',
      NULL,
      'marlyn noguera'
    ),
    (
      v_empresa_id,
      'Marne Benitez',
      '0994477031',
      '10mil',
      'marne benitez'
    ),
    (
      v_empresa_id,
      'Maroli Estigarribia',
      '0971645717',
      NULL,
      'maroli estigarribia'
    ),
    (
      v_empresa_id,
      'Marta Ayala',
      '0994600366',
      NULL,
      'marta ayala'
    ),
    (
      v_empresa_id,
      'Marta Balmaceda',
      '0994203425',
      NULL,
      'marta balmaceda'
    ),
    (
      v_empresa_id,
      'Marta Benegas',
      '0985402243',
      NULL,
      'marta benegas'
    ),
    (
      v_empresa_id,
      'Marta Danei',
      '0985199515',
      NULL,
      'marta danei'
    ),
    (
      v_empresa_id,
      'Marta Fernandez',
      '0983317507',
      NULL,
      'marta fernandez'
    ),
    (
      v_empresa_id,
      'Marta Gonzalez',
      '0992447105',
      NULL,
      'marta gonzalez'
    ),
    (
      v_empresa_id,
      'Marta Grance',
      '0984313403',
      NULL,
      'marta grance'
    ),
    (
      v_empresa_id,
      'Marta Ibanes',
      '0981786786',
      NULL,
      'marta ibanes'
    ),
    (
      v_empresa_id,
      'Marta Mereles',
      '0992443672',
      NULL,
      'marta mereles'
    ),
    (
      v_empresa_id,
      'Marta Munoz',
      '0985933769',
      NULL,
      'marta munoz'
    ),
    (
      v_empresa_id,
      'Marta Pereira',
      '0994977356',
      NULL,
      'marta pereira'
    ),
    (
      v_empresa_id,
      'Marta Portillo',
      '0986326405',
      '10mil',
      'marta portillo'
    ),
    (
      v_empresa_id,
      'Marta Recalde',
      '0984114625',
      NULL,
      'marta recalde'
    ),
    (
      v_empresa_id,
      'Marta Romero',
      '0981241815',
      '10MIL',
      'marta romero'
    ),
    (
      v_empresa_id,
      'Marta Tonanez',
      '0994884099',
      NULL,
      'marta tonanez'
    ),
    (
      v_empresa_id,
      'Marta Viveros',
      '0971200891',
      NULL,
      'marta viveros'
    ),
    (
      v_empresa_id,
      'Marta Zaracho',
      '0992301573',
      NULL,
      'marta zaracho'
    ),
    (
      v_empresa_id,
      'Marta Zarate',
      '0992301573',
      '1 selo (1)',
      'marta zarate'
    ),
    (
      v_empresa_id,
      'Martha Arriola Afara',
      '0994344315',
      NULL,
      'martha arriola afara'
    ),
    (
      v_empresa_id,
      'Martha Fernandez',
      '0983317507',
      NULL,
      'martha fernandez'
    ),
    (
      v_empresa_id,
      'Martha Gonzalez',
      '0992447105',
      NULL,
      'martha gonzalez'
    ),
    (
      v_empresa_id,
      'Martha Maidana',
      '0991297894',
      NULL,
      'martha maidana'
    ),
    (
      v_empresa_id,
      'Martha Palacios',
      '0971373370',
      NULL,
      'martha palacios'
    ),
    (
      v_empresa_id,
      'Martha Podaca',
      '0971850922',
      '10mil',
      'martha podaca'
    ),
    (
      v_empresa_id,
      'Martha Tonanez',
      '0994884099',
      NULL,
      'martha tonanez'
    ),
    (
      v_empresa_id,
      'Martha Ucedo',
      '0981967695',
      NULL,
      'martha ucedo'
    ),
    (
      v_empresa_id,
      'Martin Amarilla',
      '0981998689',
      NULL,
      'martin amarilla'
    ),
    (
      v_empresa_id,
      'Martin Coronel',
      '0981493381',
      NULL,
      'martin coronel'
    ),
    (
      v_empresa_id,
      'Martin Martan',
      '0981632750',
      NULL,
      'martin martan'
    ),
    (
      v_empresa_id,
      'Martin Morata',
      '0981130605',
      NULL,
      'martin morata'
    ),
    (
      v_empresa_id,
      'Martin Rivas',
      '0976504969',
      '20MIL',
      'martin rivas'
    ),
    (
      v_empresa_id,
      'Martina Bariloni',
      '0986808058',
      '50mil',
      'martina bariloni'
    ),
    (
      v_empresa_id,
      'Martina Fernandez',
      '0971158409',
      NULL,
      'martina fernandez'
    ),
    (
      v_empresa_id,
      'Martina Machado',
      '9833152527',
      NULL,
      'martina machado'
    ),
    (
      v_empresa_id,
      'Maru Romero',
      '0981247223',
      NULL,
      'maru romero'
    ),
    (
      v_empresa_id,
      'Mary Cantero',
      '0981678742',
      NULL,
      'mary cantero'
    ),
    (
      v_empresa_id,
      'Mary Fernandez',
      '0983831906',
      NULL,
      'mary fernandez'
    ),
    (
      v_empresa_id,
      'Mary Paz',
      '0985905374',
      NULL,
      'mary paz'
    ),
    (
      v_empresa_id,
      'Mary Paz Martinez',
      '0985905374',
      NULL,
      'mary paz martinez'
    ),
    (
      v_empresa_id,
      'Mathias Echeverria',
      NULL,
      NULL,
      'mathias echeverria'
    ),
    (
      v_empresa_id,
      'Mathias Scholler',
      '0971214275',
      NULL,
      'mathias scholler'
    ),
    (
      v_empresa_id,
      'Mathias Tosar',
      '0974274114',
      NULL,
      'mathias tosar'
    ),
    (
      v_empresa_id,
      'Mati Alfonso',
      '61423356642',
      NULL,
      'mati alfonso'
    ),
    (
      v_empresa_id,
      'Matias Barg',
      '0983668383',
      NULL,
      'matias barg'
    ),
    (
      v_empresa_id,
      'Matias Gomez',
      '0991840964',
      '10mil',
      'matias gomez'
    ),
    (
      v_empresa_id,
      'Matias Rodas',
      '0974981428',
      NULL,
      'matias rodas'
    ),
    (
      v_empresa_id,
      'Matilde Britez',
      '0984251014',
      '10mil',
      'matilde britez'
    ),
    (
      v_empresa_id,
      'Matilde Gonzalez',
      '0981980397',
      NULL,
      'matilde gonzalez'
    ),
    (
      v_empresa_id,
      'Matilde Palacio',
      '0983349706',
      NULL,
      'matilde palacio'
    ),
    (
      v_empresa_id,
      'Matilde Ruiz',
      '0981667216',
      NULL,
      'matilde ruiz'
    ),
    (
      v_empresa_id,
      'Maura Bogado',
      '0986392030',
      '30mil',
      'maura bogado'
    ),
    (
      v_empresa_id,
      'Maura Epinola',
      '0972504027',
      NULL,
      'maura epinola'
    ),
    (
      v_empresa_id,
      'Maura Irala',
      '0981398994',
      '20mil',
      'maura irala'
    ),
    (
      v_empresa_id,
      'Maura Nocatei',
      '0983014633',
      NULL,
      'maura nocatei'
    ),
    (
      v_empresa_id,
      'Maura Rodas',
      '0976103333',
      NULL,
      'maura rodas'
    ),
    (
      v_empresa_id,
      'Maura Ruiz Dias',
      '0983710793',
      NULL,
      'maura ruiz dias'
    ),
    (
      v_empresa_id,
      'Maura Samudio',
      '0983452733',
      NULL,
      'maura samudio'
    ),
    (
      v_empresa_id,
      'Mauricia Irala',
      '0972591187',
      '10mil',
      'mauricia irala'
    ),
    (
      v_empresa_id,
      'Mauricio Amarilla',
      '0983736194',
      NULL,
      'mauricio amarilla'
    ),
    (
      v_empresa_id,
      'Mauricio Frank',
      '0984188090',
      NULL,
      'mauricio frank'
    ),
    (
      v_empresa_id,
      'Mauro Mendoza',
      '0974932594',
      NULL,
      'mauro mendoza'
    ),
    (
      v_empresa_id,
      'Mavel Escobar',
      '0982208001',
      NULL,
      'mavel escobar'
    ),
    (
      v_empresa_id,
      'Mavyca Ligalis',
      '0981501487',
      '10mil',
      'mavyca ligalis'
    ),
    (
      v_empresa_id,
      'Maxima Lugo',
      '0972182034',
      NULL,
      'maxima lugo'
    ),
    (
      v_empresa_id,
      'Maya Carraro',
      '0984390595',
      NULL,
      'maya carraro'
    ),
    (
      v_empresa_id,
      'Mayra Allen',
      '0986475925',
      NULL,
      'mayra allen'
    ),
    (
      v_empresa_id,
      'Mayra Capdevila',
      '0971153454',
      NULL,
      'mayra capdevila'
    ),
    (
      v_empresa_id,
      'Mayra Rojas',
      '0994707999',
      NULL,
      'mayra rojas'
    ),
    (
      v_empresa_id,
      'Mayra Villalba',
      '0971134421',
      NULL,
      'mayra villalba'
    ),
    (
      v_empresa_id,
      'Maytha Fretes',
      '0971220405',
      NULL,
      'maytha fretes'
    ),
    (
      v_empresa_id,
      'Megy Rahen',
      '0982414050',
      NULL,
      'megy rahen'
    ),
    (
      v_empresa_id,
      'Mela',
      NULL,
      NULL,
      'mela'
    ),
    (
      v_empresa_id,
      'Melani Bobadilla',
      '0971851375',
      NULL,
      'melani bobadilla'
    ),
    (
      v_empresa_id,
      'Melanie',
      NULL,
      NULL,
      'melanie'
    ),
    (
      v_empresa_id,
      'Melany Melgarejo',
      '0981497172',
      NULL,
      'melany melgarejo'
    ),
    (
      v_empresa_id,
      'Melba Flores',
      '0975341102',
      NULL,
      'melba flores'
    ),
    (
      v_empresa_id,
      'Melena Arantea',
      '0992632632',
      NULL,
      'melena arantea'
    ),
    (
      v_empresa_id,
      'Melina Perez',
      '0975681568',
      '10mil',
      'melina perez'
    ),
    (
      v_empresa_id,
      'Melina Zapata',
      '0992227101',
      NULL,
      'melina zapata'
    ),
    (
      v_empresa_id,
      'Melisa Arevalos',
      '0983477330',
      NULL,
      'melisa arevalos'
    ),
    (
      v_empresa_id,
      'Melisa Benegas',
      '0983963197',
      NULL,
      'melisa benegas'
    ),
    (
      v_empresa_id,
      'Melisa Castro',
      '0982917439',
      NULL,
      'melisa castro'
    ),
    (
      v_empresa_id,
      'Melisa Chamorro',
      '0982413439',
      '10mil',
      'melisa chamorro'
    ),
    (
      v_empresa_id,
      'Melisa Correa',
      '0961870407',
      NULL,
      'melisa correa'
    ),
    (
      v_empresa_id,
      'Melisa Desbar',
      '0972595744',
      NULL,
      'melisa desbar'
    ),
    (
      v_empresa_id,
      'Melisa Duarte',
      NULL,
      NULL,
      'melisa duarte'
    ),
    (
      v_empresa_id,
      'Melisa Ferreira',
      '0981182100',
      NULL,
      'melisa ferreira'
    ),
    (
      v_empresa_id,
      'Melisa Florentin',
      '0982506266',
      NULL,
      'melisa florentin'
    ),
    (
      v_empresa_id,
      'Melisa Mendoza',
      '0983324875',
      NULL,
      'melisa mendoza'
    ),
    (
      v_empresa_id,
      'Melisa Notario',
      '0983712806',
      NULL,
      'melisa notario'
    ),
    (
      v_empresa_id,
      'Melisa Ocampos',
      '0983287006',
      NULL,
      'melisa ocampos'
    ),
    (
      v_empresa_id,
      'Melisa Ortiz',
      '0982590522',
      NULL,
      'melisa ortiz'
    ),
    (
      v_empresa_id,
      'Melissa Aguilar',
      '0984613825',
      NULL,
      'melissa aguilar'
    ),
    (
      v_empresa_id,
      'Melissa Canale',
      '0985282845',
      '1 selo (2)',
      'melissa canale'
    ),
    (
      v_empresa_id,
      'Melissa Centurion',
      '0994204238',
      NULL,
      'melissa centurion'
    ),
    (
      v_empresa_id,
      'Melissa Chamorro',
      '0982413439',
      NULL,
      'melissa chamorro'
    ),
    (
      v_empresa_id,
      'Melissa Duarte',
      '0981830007',
      NULL,
      'melissa duarte'
    ),
    (
      v_empresa_id,
      'Melissa Nunez',
      '0972270421',
      '10mil',
      'melissa nunez'
    ),
    (
      v_empresa_id,
      'Melissa Ortiz',
      '0986369800',
      NULL,
      'melissa ortiz'
    ),
    (
      v_empresa_id,
      'Melissa Salina',
      '0981293012',
      NULL,
      'melissa salina'
    ),
    (
      v_empresa_id,
      'Melissa Spani',
      '0981289703',
      NULL,
      'melissa spani'
    ),
    (
      v_empresa_id,
      'Melissa Zanchez',
      '0971323122',
      NULL,
      'melissa zanchez'
    ),
    (
      v_empresa_id,
      'Meliza Diaz',
      '0994888980',
      NULL,
      'meliza diaz'
    ),
    (
      v_empresa_id,
      'Melizza Gutierrez',
      '0985838089',
      NULL,
      'melizza gutierrez'
    ),
    (
      v_empresa_id,
      'Melody Gonzalez',
      '0971519825',
      NULL,
      'melody gonzalez'
    ),
    (
      v_empresa_id,
      'Melody Navarro',
      '0984216927',
      '10mil',
      'melody navarro'
    ),
    (
      v_empresa_id,
      'Mercado',
      NULL,
      NULL,
      'mercado'
    ),
    (
      v_empresa_id,
      'Mercedes Ayala',
      '0981870790',
      NULL,
      'mercedes ayala'
    ),
    (
      v_empresa_id,
      'Mercedes F de Rolon',
      '0981418876',
      NULL,
      'mercedes f de rolon'
    ),
    (
      v_empresa_id,
      'Mercedes Ferreira',
      '0972878563',
      NULL,
      'mercedes ferreira'
    ),
    (
      v_empresa_id,
      'Mercedes Gomez',
      '0971384221',
      NULL,
      'mercedes gomez'
    ),
    (
      v_empresa_id,
      'Mercedes Gonzalez',
      '0971632268',
      NULL,
      'mercedes gonzalez'
    ),
    (
      v_empresa_id,
      'Mercedes Laterra',
      '0981815038',
      '1 selo (1)',
      'mercedes laterra'
    ),
    (
      v_empresa_id,
      'Mercedes Martines',
      '0991532026',
      NULL,
      'mercedes martines'
    ),
    (
      v_empresa_id,
      'Mercedes Martinez',
      '0981357878',
      NULL,
      'mercedes martinez'
    ),
    (
      v_empresa_id,
      'Mercedes Ortiz',
      '0971650639',
      NULL,
      'mercedes ortiz'
    ),
    (
      v_empresa_id,
      'Mercedes Paredes',
      '0971200185',
      NULL,
      'mercedes paredes'
    ),
    (
      v_empresa_id,
      'Mercedes Ramonse',
      '0981228928',
      NULL,
      'mercedes ramonse'
    ),
    (
      v_empresa_id,
      'Mercedes Rasmosa',
      '0981228928',
      '1 selo (1)',
      'mercedes rasmosa'
    ),
    (
      v_empresa_id,
      'Mercedes Rasmussen',
      '0981228928',
      NULL,
      'mercedes rasmussen'
    ),
    (
      v_empresa_id,
      'Mercedes Regins',
      '0971320649',
      NULL,
      'mercedes regins'
    ),
    (
      v_empresa_id,
      'Mercedes Samaniego',
      '0982109422',
      NULL,
      'mercedes samaniego'
    ),
    (
      v_empresa_id,
      'Mercedes Sanchez',
      '0971640750',
      NULL,
      'mercedes sanchez'
    ),
    (
      v_empresa_id,
      'Mia Ocampos',
      '0972597265',
      NULL,
      'mia ocampos'
    ),
    (
      v_empresa_id,
      'Mia Paiba Tufari',
      '0986649448',
      NULL,
      'mia paiba tufari'
    ),
    (
      v_empresa_id,
      'Mia Romero',
      '0981497561',
      '20mil',
      'mia romero'
    ),
    (
      v_empresa_id,
      'Micaela Alvarez',
      '0984092331',
      NULL,
      'micaela alvarez'
    ),
    (
      v_empresa_id,
      'Micaela Benitez',
      '0971772700',
      NULL,
      'micaela benitez'
    ),
    (
      v_empresa_id,
      'Micaela Cabanas',
      '0992786040',
      NULL,
      'micaela cabanas'
    ),
    (
      v_empresa_id,
      'Micaela Ferrari',
      '0971126076',
      '40MIL',
      'micaela ferrari'
    ),
    (
      v_empresa_id,
      'Micaela Flores',
      NULL,
      NULL,
      'micaela flores'
    ),
    (
      v_empresa_id,
      'Micaela Hildebrand',
      '0974427015',
      NULL,
      'micaela hildebrand'
    ),
    (
      v_empresa_id,
      'Micaela Martinez',
      '0981777420',
      NULL,
      'micaela martinez'
    ),
    (
      v_empresa_id,
      'Micaela Medina',
      '0983653185',
      NULL,
      'micaela medina'
    ),
    (
      v_empresa_id,
      'Micaela Mendez',
      '0984982545',
      '20mil',
      'micaela mendez'
    ),
    (
      v_empresa_id,
      'Micaela Nunes',
      '0981564461',
      NULL,
      'micaela nunes'
    ),
    (
      v_empresa_id,
      'Micaela Riveros',
      '0991193435',
      NULL,
      'micaela riveros'
    ),
    (
      v_empresa_id,
      'Micaela Rojas',
      NULL,
      NULL,
      'micaela rojas'
    ),
    (
      v_empresa_id,
      'Micaela Villar',
      '0971634802',
      NULL,
      'micaela villar'
    ),
    (
      v_empresa_id,
      'Micaela Weiss',
      '0985989237',
      NULL,
      'micaela weiss'
    ),
    (
      v_empresa_id,
      'Micaela zarate',
      '0962119894',
      '10MIL',
      'micaela zarate'
    ),
    (
      v_empresa_id,
      'MicaelaGomez',
      '0984923068',
      NULL,
      'micaelagomez'
    ),
    (
      v_empresa_id,
      'Micaias Trinidad',
      '0971264784',
      '1 selO (3)',
      'micaias trinidad'
    ),
    (
      v_empresa_id,
      'Micalea Molinas',
      '0976449731',
      NULL,
      'micalea molinas'
    ),
    (
      v_empresa_id,
      'Michaal Baten',
      '0992257000',
      '30mil',
      'michaal baten'
    ),
    (
      v_empresa_id,
      'Michal Baten',
      '0992257000',
      NULL,
      'michal baten'
    ),
    (
      v_empresa_id,
      'Michel Samudio',
      '0972637773',
      NULL,
      'michel samudio'
    ),
    (
      v_empresa_id,
      'Michell Campi',
      '0986668133',
      NULL,
      'michell campi'
    ),
    (
      v_empresa_id,
      'Michelle Caceres',
      '0971586950',
      NULL,
      'michelle caceres'
    ),
    (
      v_empresa_id,
      'Miguel Angel Gomez',
      '0994793441',
      '30MIL',
      'miguel angel gomez'
    ),
    (
      v_empresa_id,
      'Miguel Angel Martinez',
      '0991244981',
      NULL,
      'miguel angel martinez'
    ),
    (
      v_empresa_id,
      'Miguel Cuevas',
      '0985446316',
      NULL,
      'miguel cuevas'
    ),
    (
      v_empresa_id,
      'Miguel Quintana',
      '0985297100',
      NULL,
      'miguel quintana'
    ),
    (
      v_empresa_id,
      'Miguel Rodriguez',
      NULL,
      NULL,
      'miguel rodriguez'
    ),
    (
      v_empresa_id,
      'Miguel Rojas',
      '0982254356',
      NULL,
      'miguel rojas'
    ),
    (
      v_empresa_id,
      'Miguel Talavera',
      '0981194291',
      NULL,
      'miguel talavera'
    ),
    (
      v_empresa_id,
      'Miguel Vera',
      '0976591162',
      NULL,
      'miguel vera'
    ),
    (
      v_empresa_id,
      'Miguelina Olguin',
      '0981121254',
      '1 selo (1)',
      'miguelina olguin'
    ),
    (
      v_empresa_id,
      'Mijao',
      '0991726650',
      NULL,
      'mijao'
    ),
    (
      v_empresa_id,
      'Mikaela Cajo de vila',
      '0992884695',
      '10mil',
      'mikaela cajo de vila'
    ),
    (
      v_empresa_id,
      'Mikaela Destefano',
      '0984576284',
      NULL,
      'mikaela destefano'
    ),
    (
      v_empresa_id,
      'Mikaela Fleitas',
      '0984212033',
      NULL,
      'mikaela fleitas'
    ),
    (
      v_empresa_id,
      'Mikaela Marejo',
      '0992919044',
      '10mil',
      'mikaela marejo'
    ),
    (
      v_empresa_id,
      'Mikaela Villareo',
      '0991682100',
      NULL,
      'mikaela villareo'
    ),
    (
      v_empresa_id,
      'Mikeila',
      '0972698770',
      NULL,
      'mikeila'
    ),
    (
      v_empresa_id,
      'Mikeila Hamos',
      NULL,
      NULL,
      'mikeila hamos'
    ),
    (
      v_empresa_id,
      'Mila Lopez',
      '0981853738',
      NULL,
      'mila lopez'
    ),
    (
      v_empresa_id,
      'Milagro Ayala',
      '0984031524',
      NULL,
      'milagro ayala'
    ),
    (
      v_empresa_id,
      'Milagros',
      NULL,
      NULL,
      'milagros'
    ),
    (
      v_empresa_id,
      'Milagros Alonso',
      '0984348290',
      NULL,
      'milagros alonso'
    ),
    (
      v_empresa_id,
      'Milagros Arguello',
      '0984796274',
      NULL,
      'milagros arguello'
    ),
    (
      v_empresa_id,
      'Milagros Arrugo',
      '0981203521',
      NULL,
      'milagros arrugo'
    ),
    (
      v_empresa_id,
      'Milagros Benitez',
      '0983872086',
      NULL,
      'milagros benitez'
    ),
    (
      v_empresa_id,
      'Milagros Brites',
      '0983783205',
      NULL,
      'milagros brites'
    ),
    (
      v_empresa_id,
      'Milagros Escobar',
      '0991669342',
      NULL,
      'milagros escobar'
    ),
    (
      v_empresa_id,
      'Milagros Ferreira',
      '0972618446',
      NULL,
      'milagros ferreira'
    ),
    (
      v_empresa_id,
      'Milagros Gill',
      '0985701768',
      NULL,
      'milagros gill'
    ),
    (
      v_empresa_id,
      'Milagros Iguraca',
      '0984889045',
      NULL,
      'milagros iguraca'
    ),
    (
      v_empresa_id,
      'Milagros Irala',
      '0971316041',
      NULL,
      'milagros irala'
    ),
    (
      v_empresa_id,
      'Milagros Iuraca',
      '0984889045',
      NULL,
      'milagros iuraca'
    ),
    (
      v_empresa_id,
      'Milagros Lopez',
      '0983952858',
      NULL,
      'milagros lopez'
    ),
    (
      v_empresa_id,
      'Milagros Lugo',
      '0985228783',
      NULL,
      'milagros lugo'
    ),
    (
      v_empresa_id,
      'Milagros Martinez',
      '0981922728',
      '30mil',
      'milagros martinez'
    ),
    (
      v_empresa_id,
      'Milagros Masari',
      '0982504083',
      '10mil',
      'milagros masari'
    ),
    (
      v_empresa_id,
      'Milagros Medina',
      '0972458389',
      NULL,
      'milagros medina'
    ),
    (
      v_empresa_id,
      'Milagros Molinas',
      '0984161188',
      '10mil',
      'milagros molinas'
    ),
    (
      v_empresa_id,
      'Milagros Ocampos',
      '0985881722',
      NULL,
      'milagros ocampos'
    ),
    (
      v_empresa_id,
      'Milagros Portillo',
      '0984354839',
      NULL,
      'milagros portillo'
    ),
    (
      v_empresa_id,
      'Milagros Rafar',
      '0985954645',
      NULL,
      'milagros rafar'
    ),
    (
      v_empresa_id,
      'Milagros Rios',
      '0971198350',
      NULL,
      'milagros rios'
    ),
    (
      v_empresa_id,
      'Milagros Rojas',
      '0992602153',
      NULL,
      'milagros rojas'
    ),
    (
      v_empresa_id,
      'Milagros Sanchez',
      '0971548926',
      NULL,
      'milagros sanchez'
    ),
    (
      v_empresa_id,
      'Milagros Santacruz',
      '0985483359',
      NULL,
      'milagros santacruz'
    ),
    (
      v_empresa_id,
      'Milagros Velazquez',
      '0991950500',
      NULL,
      'milagros velazquez'
    ),
    (
      v_empresa_id,
      'Milagros Villalba',
      '0971912374',
      NULL,
      'milagros villalba'
    ),
    (
      v_empresa_id,
      'Milba Gaona',
      '0972294501',
      NULL,
      'milba gaona'
    ),
    (
      v_empresa_id,
      'Milda Peralta',
      '0972260400',
      NULL,
      'milda peralta'
    ),
    (
      v_empresa_id,
      'Milena Avalos',
      '0981468800',
      NULL,
      'milena avalos'
    ),
    (
      v_empresa_id,
      'Milena Ayala',
      '0985137663',
      NULL,
      'milena ayala'
    ),
    (
      v_empresa_id,
      'Milena Caballero',
      '0992545814',
      NULL,
      'milena caballero'
    ),
    (
      v_empresa_id,
      'Milena Davalos',
      '0983761811',
      NULL,
      'milena davalos'
    ),
    (
      v_empresa_id,
      'Milena Delmaes',
      '0991720242',
      NULL,
      'milena delmaes'
    ),
    (
      v_empresa_id,
      'Milena Enciso',
      '0983697550',
      '10mil',
      'milena enciso'
    ),
    (
      v_empresa_id,
      'Milena Palacio',
      '0981610053',
      NULL,
      'milena palacio'
    ),
    (
      v_empresa_id,
      'Milka Arzberger',
      '0986283534',
      '30mil',
      'milka arzberger'
    ),
    (
      v_empresa_id,
      'Milka Cantero',
      '0981769013',
      '1 selo (1)',
      'milka cantero'
    ),
    (
      v_empresa_id,
      'Milka Cespedes',
      '0971395555',
      NULL,
      'milka cespedes'
    ),
    (
      v_empresa_id,
      'Milka Espinola',
      '0984378175',
      NULL,
      'milka espinola'
    ),
    (
      v_empresa_id,
      'Milka Ramirez',
      '0994216008',
      NULL,
      'milka ramirez'
    ),
    (
      v_empresa_id,
      'Milkaela Arce',
      '0981940982',
      NULL,
      'milkaela arce'
    ),
    (
      v_empresa_id,
      'Miranda Rojas',
      '0972612377',
      NULL,
      'miranda rojas'
    ),
    (
      v_empresa_id,
      'Mirella Mendez',
      '0984959101',
      NULL,
      'mirella mendez'
    ),
    (
      v_empresa_id,
      'Mirella Meza',
      '0976776143',
      NULL,
      'mirella meza'
    ),
    (
      v_empresa_id,
      'Mirella Ramos',
      '0992874022',
      NULL,
      'mirella ramos'
    ),
    (
      v_empresa_id,
      'Mireya Ramos',
      '0992874022',
      NULL,
      'mireya ramos'
    ),
    (
      v_empresa_id,
      'miriam ingreso',
      NULL,
      NULL,
      'miriam ingreso'
    ),
    (
      v_empresa_id,
      'Miriam Perez',
      '0971700866',
      NULL,
      'miriam perez'
    ),
    (
      v_empresa_id,
      'Mirian',
      '0983109719',
      NULL,
      'mirian'
    ),
    (
      v_empresa_id,
      'Mirian Alvarenga',
      '0987208235',
      NULL,
      'mirian alvarenga'
    ),
    (
      v_empresa_id,
      'Mirian Arsamendia',
      '0983975132',
      '10mil',
      'mirian arsamendia'
    ),
    (
      v_empresa_id,
      'Mirian Arzamendia',
      '0983975132',
      NULL,
      'mirian arzamendia'
    ),
    (
      v_empresa_id,
      'Mirian Balbuena',
      '0975686766',
      '20MIL',
      'mirian balbuena'
    ),
    (
      v_empresa_id,
      'Mirian Benegas',
      '0983589749',
      NULL,
      'mirian benegas'
    ),
    (
      v_empresa_id,
      'Mirian Benitez',
      '0982315698',
      NULL,
      'mirian benitez'
    ),
    (
      v_empresa_id,
      'Mirian Caballero',
      '0981149535',
      NULL,
      'mirian caballero'
    ),
    (
      v_empresa_id,
      'Mirian Centurion',
      '0981271268',
      NULL,
      'mirian centurion'
    ),
    (
      v_empresa_id,
      'Mirian Denis',
      '0986638564',
      NULL,
      'mirian denis'
    ),
    (
      v_empresa_id,
      'Mirian Diaz',
      '0991533791',
      NULL,
      'mirian diaz'
    ),
    (
      v_empresa_id,
      'Mirian Gimenez',
      '0985578263',
      NULL,
      'mirian gimenez'
    ),
    (
      v_empresa_id,
      'Mirian Lugo',
      '0983114414',
      NULL,
      'mirian lugo'
    ),
    (
      v_empresa_id,
      'Mirian Medina',
      '0971243570',
      '20MIL',
      'mirian medina'
    ),
    (
      v_empresa_id,
      'Mirian Melleid',
      '0983109719',
      NULL,
      'mirian melleid'
    ),
    (
      v_empresa_id,
      'Mirian Rodriguez',
      '0971784186',
      NULL,
      'mirian rodriguez'
    ),
    (
      v_empresa_id,
      'Mirian Romero',
      '0991524452',
      NULL,
      'mirian romero'
    ),
    (
      v_empresa_id,
      'Mirian Salinas',
      '0971908017',
      NULL,
      'mirian salinas'
    ),
    (
      v_empresa_id,
      'Mirian Sanchez',
      '0982671115',
      NULL,
      'mirian sanchez'
    ),
    (
      v_empresa_id,
      'Mirian Telles',
      '0981263626',
      NULL,
      'mirian telles'
    ),
    (
      v_empresa_id,
      'Mirian Toledo',
      '0992956368',
      NULL,
      'mirian toledo'
    ),
    (
      v_empresa_id,
      'Mirian Torres',
      '0981145577',
      '20mil',
      'mirian torres'
    ),
    (
      v_empresa_id,
      'Mirian Viilalba',
      '0986685084',
      NULL,
      'mirian viilalba'
    ),
    (
      v_empresa_id,
      'Mirina Diaz',
      '0976952716',
      NULL,
      'mirina diaz'
    ),
    (
      v_empresa_id,
      'Mirjan Schuuhmann',
      '0982145836',
      NULL,
      'mirjan schuuhmann'
    ),
    (
      v_empresa_id,
      'Mirna Bogado',
      '0992581849',
      NULL,
      'mirna bogado'
    ),
    (
      v_empresa_id,
      'Mirna Britez',
      '0981607370',
      '10mil',
      'mirna britez'
    ),
    (
      v_empresa_id,
      'Mirna Denis',
      '0981898649',
      NULL,
      'mirna denis'
    ),
    (
      v_empresa_id,
      'Mirna Escobar',
      '0975340348',
      NULL,
      'mirna escobar'
    ),
    (
      v_empresa_id,
      'Mirna Ferreira',
      '0981420490',
      NULL,
      'mirna ferreira'
    ),
    (
      v_empresa_id,
      'Mirna Galeano',
      '0976838010',
      NULL,
      'mirna galeano'
    ),
    (
      v_empresa_id,
      'Mirna Gimenez',
      '0983838502',
      NULL,
      'mirna gimenez'
    ),
    (
      v_empresa_id,
      'Mirna Mercado',
      '0972646087',
      NULL,
      'mirna mercado'
    ),
    (
      v_empresa_id,
      'Mirna Saprisa',
      '0972654895',
      NULL,
      'mirna saprisa'
    ),
    (
      v_empresa_id,
      'Mirna Villalba',
      '0986526565',
      NULL,
      'mirna villalba'
    ),
    (
      v_empresa_id,
      'Mirta Barreto',
      '0984403911',
      NULL,
      'mirta barreto'
    ),
    (
      v_empresa_id,
      'Mirta Cardenas',
      '0971341833',
      NULL,
      'mirta cardenas'
    ),
    (
      v_empresa_id,
      'Mirta Coleman',
      '0981528546',
      NULL,
      'mirta coleman'
    ),
    (
      v_empresa_id,
      'Mirta Medina',
      '0961266497',
      NULL,
      'mirta medina'
    ),
    (
      v_empresa_id,
      'Mirta Moran',
      '0981290307',
      '1 selo (1)',
      'mirta moran'
    ),
    (
      v_empresa_id,
      'Mirta Morinigo',
      '0993380178',
      NULL,
      'mirta morinigo'
    ),
    (
      v_empresa_id,
      'Mirta Sanchez',
      '0991711329',
      NULL,
      'mirta sanchez'
    ),
    (
      v_empresa_id,
      'Mirta Sosa',
      '0982106518',
      NULL,
      'mirta sosa'
    ),
    (
      v_empresa_id,
      'Mirtha Acosta',
      '0991685362',
      NULL,
      'mirtha acosta'
    ),
    (
      v_empresa_id,
      'Mirtha Arguello',
      '0972765554',
      NULL,
      'mirtha arguello'
    ),
    (
      v_empresa_id,
      'Mirtha Denis',
      '0981387170',
      '20mil',
      'mirtha denis'
    ),
    (
      v_empresa_id,
      'Mirtha Isabel',
      '0971341833',
      '10MIL',
      'mirtha isabel'
    ),
    (
      v_empresa_id,
      'Mirtha Medina',
      '0961266497',
      '1 selo (1)',
      'mirtha medina'
    ),
    (
      v_empresa_id,
      'Mirtha Paredes',
      '0994537800',
      '1 selo (1)',
      'mirtha paredes'
    ),
    (
      v_empresa_id,
      'Mirtha Sanabria',
      '0981197197',
      NULL,
      'mirtha sanabria'
    ),
    (
      v_empresa_id,
      'Miselda Romero',
      '0981748046',
      NULL,
      'miselda romero'
    ),
    (
      v_empresa_id,
      'Mishaal Baten',
      '0992257000',
      '1 selo (1)',
      'mishaal baten'
    ),
    (
      v_empresa_id,
      'Misti Lopez',
      '0976124886',
      NULL,
      'misti lopez'
    ),
    (
      v_empresa_id,
      'Mon Flores',
      '0985985066',
      NULL,
      'mon flores'
    ),
    (
      v_empresa_id,
      'Monica (tassi)',
      NULL,
      NULL,
      'monica (tassi)'
    ),
    (
      v_empresa_id,
      'Monica Abente',
      '0981743385',
      '1 selo (6)',
      'monica abente'
    ),
    (
      v_empresa_id,
      'Monica Acosta',
      '0994395923',
      NULL,
      'monica acosta'
    ),
    (
      v_empresa_id,
      'Monica Baetcke',
      '0981541566',
      NULL,
      'monica baetcke'
    ),
    (
      v_empresa_id,
      'MONICA BODYS',
      NULL,
      NULL,
      'monica bodys'
    ),
    (
      v_empresa_id,
      'Monica Escobar',
      '0981483230',
      NULL,
      'monica escobar'
    ),
    (
      v_empresa_id,
      'Monica Estigarribia',
      '0983467987',
      NULL,
      'monica estigarribia'
    ),
    (
      v_empresa_id,
      'Monica Galilea',
      '0981981142',
      NULL,
      'monica galilea'
    ),
    (
      v_empresa_id,
      'Monica Gimenez',
      '0971129577',
      NULL,
      'monica gimenez'
    ),
    (
      v_empresa_id,
      'Monica Gonzalez',
      '0991714401',
      NULL,
      'monica gonzalez'
    ),
    (
      v_empresa_id,
      'Monica Hikdeberg',
      '0974424707',
      NULL,
      'monica hikdeberg'
    ),
    (
      v_empresa_id,
      'Monica Hugo',
      '0991205265',
      NULL,
      'monica hugo'
    ),
    (
      v_empresa_id,
      'Monica Liinares',
      NULL,
      NULL,
      'monica liinares'
    ),
    (
      v_empresa_id,
      'Monica Linaris',
      '0981438239',
      '10mil',
      'monica linaris'
    ),
    (
      v_empresa_id,
      'Monica Marin',
      '0992890800',
      NULL,
      'monica marin'
    ),
    (
      v_empresa_id,
      'Monica Martinez',
      '0981963189',
      NULL,
      'monica martinez'
    ),
    (
      v_empresa_id,
      'Monica Mendoza',
      '0982242001',
      '10mil',
      'monica mendoza'
    ),
    (
      v_empresa_id,
      'Monica Ortiz',
      '0985450671',
      NULL,
      'monica ortiz'
    ),
    (
      v_empresa_id,
      'Monica Ovelar',
      '0981158206',
      NULL,
      'monica ovelar'
    ),
    (
      v_empresa_id,
      'Monica Pizani',
      '0961544979',
      NULL,
      'monica pizani'
    ),
    (
      v_empresa_id,
      'Monica Pizzani',
      '0971680002',
      NULL,
      'monica pizzani'
    ),
    (
      v_empresa_id,
      'Monica Reyes',
      '0982322024',
      NULL,
      'monica reyes'
    ),
    (
      v_empresa_id,
      'Monica Ribas',
      '0961173174',
      '1 selo',
      'monica ribas'
    ),
    (
      v_empresa_id,
      'Monica Rivas',
      '0961173174',
      '1 selo',
      'monica rivas'
    ),
    (
      v_empresa_id,
      'Monica Romero',
      '0991229178',
      NULL,
      'monica romero'
    ),
    (
      v_empresa_id,
      'Monica Segovia',
      '0971683515',
      NULL,
      'monica segovia'
    ),
    (
      v_empresa_id,
      'Monica Turlan',
      '0991703315',
      NULL,
      'monica turlan'
    ),
    (
      v_empresa_id,
      'MONITOS',
      NULL,
      NULL,
      'monitos'
    ),
    (
      v_empresa_id,
      'Monitos blancos y eso',
      NULL,
      NULL,
      'monitos blancos y eso'
    ),
    (
      v_empresa_id,
      'Monse Achon',
      '0981468578',
      NULL,
      'monse achon'
    ),
    (
      v_empresa_id,
      'Monse Barboza',
      '0982490516',
      NULL,
      'monse barboza'
    ),
    (
      v_empresa_id,
      'Monse Benitez',
      '0982394302',
      '30mil',
      'monse benitez'
    ),
    (
      v_empresa_id,
      'Monse El Ghandour',
      '0984653777',
      NULL,
      'monse el ghandour'
    ),
    (
      v_empresa_id,
      'Monse gonzalez',
      '0985345172',
      NULL,
      'monse gonzalez'
    ),
    (
      v_empresa_id,
      'Monse Leiva',
      '0991726864',
      NULL,
      'monse leiva'
    ),
    (
      v_empresa_id,
      'Monse Rojas',
      '0983831838',
      NULL,
      'monse rojas'
    ),
    (
      v_empresa_id,
      'Monserat Araujo',
      '0961256500',
      NULL,
      'monserat araujo'
    ),
    (
      v_empresa_id,
      'Monserat Arevalos',
      '0992257806',
      NULL,
      'monserat arevalos'
    ),
    (
      v_empresa_id,
      'Monserat Colman',
      '0981494214',
      NULL,
      'monserat colman'
    ),
    (
      v_empresa_id,
      'Monserat Martinez',
      '0984905392',
      NULL,
      'monserat martinez'
    ),
    (
      v_empresa_id,
      'Monserat Nunez',
      '0987257225',
      NULL,
      'monserat nunez'
    ),
    (
      v_empresa_id,
      'Monserat Ortiz',
      '0976104615',
      NULL,
      'monserat ortiz'
    ),
    (
      v_empresa_id,
      'Monserrat Amarilla',
      '0985718939',
      '20mil',
      'monserrat amarilla'
    ),
    (
      v_empresa_id,
      'Monserrat Arejo',
      '0975600181',
      NULL,
      'monserrat arejo'
    ),
    (
      v_empresa_id,
      'Monserrat Bobadilla',
      '0994344010',
      NULL,
      'monserrat bobadilla'
    ),
    (
      v_empresa_id,
      'Monserrat Diaz',
      '0993522226',
      NULL,
      'monserrat diaz'
    ),
    (
      v_empresa_id,
      'Monserrat Sanabria',
      '0976656967',
      NULL,
      'monserrat sanabria'
    ),
    (
      v_empresa_id,
      'Monserrath Frontanilla',
      '0981875830',
      NULL,
      'monserrath frontanilla'
    ),
    (
      v_empresa_id,
      'Montserrat Ramado',
      '0986407806',
      '10mil',
      'montserrat ramado'
    ),
    (
      v_empresa_id,
      'Montserrath Planas',
      '0983900221',
      NULL,
      'montserrath planas'
    ),
    (
      v_empresa_id,
      'Mordillo asia',
      NULL,
      NULL,
      'mordillo asia'
    ),
    (
      v_empresa_id,
      'Mordillos shopping asia',
      NULL,
      NULL,
      'mordillos shopping asia'
    ),
    (
      v_empresa_id,
      'Mralene Gomez',
      '0983119363',
      NULL,
      'mralene gomez'
    ),
    (
      v_empresa_id,
      'Myriam Rojas',
      '0994972292',
      NULL,
      'myriam rojas'
    ),
    (
      v_empresa_id,
      'Myrian Caballero',
      '0984948138',
      NULL,
      'myrian caballero'
    ),
    (
      v_empresa_id,
      'Myrian Ruiz',
      '0982382834',
      NULL,
      'myrian ruiz'
    ),
    (
      v_empresa_id,
      'Naara Feris',
      '0984793938',
      NULL,
      'naara feris'
    ),
    (
      v_empresa_id,
      'Naara Molinas',
      '0983899937',
      NULL,
      'naara molinas'
    ),
    (
      v_empresa_id,
      'Nacny Fretes',
      '0971888149',
      NULL,
      'nacny fretes'
    ),
    (
      v_empresa_id,
      'Nadia Alcaraz',
      '0985916224',
      NULL,
      'nadia alcaraz'
    ),
    (
      v_empresa_id,
      'Nadia Bareiro',
      '0971687089',
      NULL,
      'nadia bareiro'
    ),
    (
      v_empresa_id,
      'Nadia Caceres',
      '0971567075',
      NULL,
      'nadia caceres'
    ),
    (
      v_empresa_id,
      'Nadia Cuella',
      '0972127136',
      NULL,
      'nadia cuella'
    ),
    (
      v_empresa_id,
      'Nadia Gimenez',
      '0992917200',
      NULL,
      'nadia gimenez'
    ),
    (
      v_empresa_id,
      'Nadia Medina',
      '0971175356',
      '1 selo (1)',
      'nadia medina'
    ),
    (
      v_empresa_id,
      'Nadia Meza',
      '0961196618',
      NULL,
      'nadia meza'
    ),
    (
      v_empresa_id,
      'Nadia Ramires',
      '0994204665',
      NULL,
      'nadia ramires'
    ),
    (
      v_empresa_id,
      'Nadia Riveros',
      '0985905800',
      '1 selo (1)',
      'nadia riveros'
    ),
    (
      v_empresa_id,
      'Nadia Roa',
      '0994741531',
      NULL,
      'nadia roa'
    ),
    (
      v_empresa_id,
      'Nadia Ruiz',
      '0981538507',
      NULL,
      'nadia ruiz'
    ),
    (
      v_empresa_id,
      'Nadia Sanchez',
      '0982142103',
      NULL,
      'nadia sanchez'
    ),
    (
      v_empresa_id,
      'Nadia Soria',
      '0981827338',
      NULL,
      'nadia soria'
    ),
    (
      v_empresa_id,
      'Nadie Cabrera',
      '0972233134',
      NULL,
      'nadie cabrera'
    ),
    (
      v_empresa_id,
      'Nadua Fretes',
      '0985585666',
      '20MIL',
      'nadua fretes'
    ),
    (
      v_empresa_id,
      'Nadua Talavera',
      '0981652610',
      NULL,
      'nadua talavera'
    ),
    (
      v_empresa_id,
      'Nady Tarrres',
      '0961276011',
      NULL,
      'nady tarrres'
    ),
    (
      v_empresa_id,
      'Nahara Feris',
      '0984793938',
      NULL,
      'nahara feris'
    ),
    (
      v_empresa_id,
      'Nahir Aguilera',
      '0983186332',
      NULL,
      'nahir aguilera'
    ),
    (
      v_empresa_id,
      'Nahir Arrua',
      '0994344552',
      NULL,
      'nahir arrua'
    ),
    (
      v_empresa_id,
      'Nahir Galeano',
      '0981702890',
      NULL,
      'nahir galeano'
    ),
    (
      v_empresa_id,
      'Nahir Jara',
      '0983598008',
      NULL,
      'nahir jara'
    ),
    (
      v_empresa_id,
      'Nahomi Garcia',
      '0976111195',
      NULL,
      'nahomi garcia'
    ),
    (
      v_empresa_id,
      'Nahomi Gonzalez',
      '0984853680',
      NULL,
      'nahomi gonzalez'
    ),
    (
      v_empresa_id,
      'Naidelyn Ferreira',
      '0972771670',
      NULL,
      'naidelyn ferreira'
    ),
    (
      v_empresa_id,
      'Naila Coronel',
      '0973347487',
      NULL,
      'naila coronel'
    ),
    (
      v_empresa_id,
      'Nailedin Ferreira',
      '0972771670',
      '10MIL',
      'nailedin ferreira'
    ),
    (
      v_empresa_id,
      'Nair Aguilera',
      '0983186332',
      NULL,
      'nair aguilera'
    ),
    (
      v_empresa_id,
      'Nair Zorilla',
      '0987192799',
      '50mil',
      'nair zorilla'
    ),
    (
      v_empresa_id,
      'Nalia Paiva',
      '0982440082',
      NULL,
      'nalia paiva'
    ),
    (
      v_empresa_id,
      'Nama Aguilera',
      '0982163304',
      NULL,
      'nama aguilera'
    ),
    (
      v_empresa_id,
      'Nancy Alfonso',
      '0976851394',
      NULL,
      'nancy alfonso'
    ),
    (
      v_empresa_id,
      'Nancy Alonso',
      '0985700517',
      NULL,
      'nancy alonso'
    ),
    (
      v_empresa_id,
      'Nancy Caceres',
      '0984383840',
      NULL,
      'nancy caceres'
    ),
    (
      v_empresa_id,
      'Nancy Duarte',
      '0983606521',
      '60mil',
      'nancy duarte'
    ),
    (
      v_empresa_id,
      'Nancy Fernandez',
      '0983410241',
      NULL,
      'nancy fernandez'
    ),
    (
      v_empresa_id,
      'Nancy Gimenez',
      '0994983221',
      NULL,
      'nancy gimenez'
    ),
    (
      v_empresa_id,
      'Nancy Gomez',
      '0981149019',
      NULL,
      'nancy gomez'
    ),
    (
      v_empresa_id,
      'Nancy romero',
      '0982570113',
      NULL,
      'nancy romero'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 9: filas 4001..4500
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Nancy Salinas',
      '0984649063',
      NULL,
      'nancy salinas'
    ),
    (
      v_empresa_id,
      'Nancy silvero',
      '0981815035',
      NULL,
      'nancy silvero'
    ),
    (
      v_empresa_id,
      'Nancy Torres',
      '874463056',
      NULL,
      'nancy torres'
    ),
    (
      v_empresa_id,
      'Nancy Villalba',
      '9922215338',
      NULL,
      'nancy villalba'
    ),
    (
      v_empresa_id,
      'Nanni Yamazaki',
      '0995369835',
      NULL,
      'nanni yamazaki'
    ),
    (
      v_empresa_id,
      'Naomi Alarcon',
      '0982332212',
      '10MIL',
      'naomi alarcon'
    ),
    (
      v_empresa_id,
      'Naomi Garcia',
      '9761195',
      NULL,
      'naomi garcia'
    ),
    (
      v_empresa_id,
      'Naomi Guilera',
      '0991672858',
      NULL,
      'naomi guilera'
    ),
    (
      v_empresa_id,
      'Naomi Lezcano',
      '0972234443',
      'ecobag',
      'naomi lezcano'
    ),
    (
      v_empresa_id,
      'Naomi Orube',
      '0991664242',
      NULL,
      'naomi orube'
    ),
    (
      v_empresa_id,
      'Naomi Paniagua',
      '0971904408',
      NULL,
      'naomi paniagua'
    ),
    (
      v_empresa_id,
      'Nara Arzamendia',
      '0972499145',
      NULL,
      'nara arzamendia'
    ),
    (
      v_empresa_id,
      'Nara Lopez',
      '0983148509',
      NULL,
      'nara lopez'
    ),
    (
      v_empresa_id,
      'Nara Valiente',
      '0985300575',
      '1  selo (1)',
      'nara valiente'
    ),
    (
      v_empresa_id,
      'Nardi Centurion',
      '0981971140',
      NULL,
      'nardi centurion'
    ),
    (
      v_empresa_id,
      'Naria Riveros',
      '0986802297',
      NULL,
      'naria riveros'
    ),
    (
      v_empresa_id,
      'Natali Britoz',
      '0985752029',
      NULL,
      'natali britoz'
    ),
    (
      v_empresa_id,
      'Natali Fidabel',
      '0992683143',
      NULL,
      'natali fidabel'
    ),
    (
      v_empresa_id,
      'Natali Gomez',
      '0983568720',
      NULL,
      'natali gomez'
    ),
    (
      v_empresa_id,
      'Natali Gonzalez',
      '0992927800',
      NULL,
      'natali gonzalez'
    ),
    (
      v_empresa_id,
      'Natalia Aguilar',
      '0972622944',
      NULL,
      'natalia aguilar'
    ),
    (
      v_empresa_id,
      'Natalia Alcaraz',
      '0994985121',
      NULL,
      'natalia alcaraz'
    ),
    (
      v_empresa_id,
      'Natalia Asvila',
      '0982684023',
      NULL,
      'natalia asvila'
    ),
    (
      v_empresa_id,
      'Natalia Baez',
      '0984200929',
      NULL,
      'natalia baez'
    ),
    (
      v_empresa_id,
      'Natalia Baeza',
      '9842000929',
      NULL,
      'natalia baeza'
    ),
    (
      v_empresa_id,
      'Natalia Benegas',
      '0982470129',
      NULL,
      'natalia benegas'
    ),
    (
      v_empresa_id,
      'Natalia Caballero',
      '0985465224',
      NULL,
      'natalia caballero'
    ),
    (
      v_empresa_id,
      'Natalia Cataldi',
      '0981727499',
      NULL,
      'natalia cataldi'
    ),
    (
      v_empresa_id,
      'Natalia Celle',
      '0971859220',
      NULL,
      'natalia celle'
    ),
    (
      v_empresa_id,
      'Natalia Chamorro',
      '0972775131',
      '30MIL',
      'natalia chamorro'
    ),
    (
      v_empresa_id,
      'Natalia Dasilva',
      '0984200929',
      NULL,
      'natalia dasilva'
    ),
    (
      v_empresa_id,
      'Natalia Delgado',
      '0982109130',
      NULL,
      'natalia delgado'
    ),
    (
      v_empresa_id,
      'Natalia Dewitte',
      '0981902374',
      NULL,
      'natalia dewitte'
    ),
    (
      v_empresa_id,
      'Natalia Enciso',
      '0991871863',
      '30mil',
      'natalia enciso'
    ),
    (
      v_empresa_id,
      'Natalia Escobar',
      '0983706212',
      NULL,
      'natalia escobar'
    ),
    (
      v_empresa_id,
      'Natalia Fernandez',
      '0984287943',
      NULL,
      'natalia fernandez'
    ),
    (
      v_empresa_id,
      'Natalia Ferreira',
      '0972838685',
      NULL,
      'natalia ferreira'
    ),
    (
      v_empresa_id,
      'Natalia Gomez',
      '0982821241',
      NULL,
      'natalia gomez'
    ),
    (
      v_empresa_id,
      'Natalia Gonzalez',
      '0983976051',
      NULL,
      'natalia gonzalez'
    ),
    (
      v_empresa_id,
      'Natalia Gutierrez',
      '0987213437',
      NULL,
      'natalia gutierrez'
    ),
    (
      v_empresa_id,
      'Natalia Jara',
      '0982282038',
      NULL,
      'natalia jara'
    ),
    (
      v_empresa_id,
      'Natalia Lopez',
      '0984113173',
      NULL,
      'natalia lopez'
    ),
    (
      v_empresa_id,
      'Natalia Marecos',
      '0971556395',
      NULL,
      'natalia marecos'
    ),
    (
      v_empresa_id,
      'Natalia Marin',
      '0991247564',
      NULL,
      'natalia marin'
    ),
    (
      v_empresa_id,
      'Natalia Matto',
      '0981105720',
      NULL,
      'natalia matto'
    ),
    (
      v_empresa_id,
      'Natalia Medina',
      '0981776961',
      NULL,
      'natalia medina'
    ),
    (
      v_empresa_id,
      'Natalia Mercado',
      '0986508076',
      NULL,
      'natalia mercado'
    ),
    (
      v_empresa_id,
      'Natalia Montiel',
      '0986820954',
      NULL,
      'natalia montiel'
    ),
    (
      v_empresa_id,
      'Natalia Navarro',
      '0971100133',
      NULL,
      'natalia navarro'
    ),
    (
      v_empresa_id,
      'Natalia Pena',
      '0985915466',
      '10MIL',
      'natalia pena'
    ),
    (
      v_empresa_id,
      'Natalia Quinones',
      '0961464014',
      '10mil',
      'natalia quinones'
    ),
    (
      v_empresa_id,
      'Natalia Riquelme',
      '0971950467',
      NULL,
      'natalia riquelme'
    ),
    (
      v_empresa_id,
      'Natalia Rodriguez',
      '0971481511',
      NULL,
      'natalia rodriguez'
    ),
    (
      v_empresa_id,
      'Natalia Romero',
      '0981602924',
      NULL,
      'natalia romero'
    ),
    (
      v_empresa_id,
      'Natalia Sanabria',
      '0984397652',
      NULL,
      'natalia sanabria'
    ),
    (
      v_empresa_id,
      'Natalia Sanchez',
      '0982909265',
      NULL,
      'natalia sanchez'
    ),
    (
      v_empresa_id,
      'Natalia Schirmacher',
      '0984898990',
      NULL,
      'natalia schirmacher'
    ),
    (
      v_empresa_id,
      'Natalia Servin',
      '0981304155',
      '10MIL',
      'natalia servin'
    ),
    (
      v_empresa_id,
      'Natalia Valdes',
      '0981709996',
      NULL,
      'natalia valdes'
    ),
    (
      v_empresa_id,
      'Natalia Valdivia',
      NULL,
      NULL,
      'natalia valdivia'
    ),
    (
      v_empresa_id,
      'Natalia Vallejo',
      '0981153153',
      '1 selo (1)',
      'natalia vallejo'
    ),
    (
      v_empresa_id,
      'Natalia Valvidia',
      '0985899982',
      '20MIL',
      'natalia valvidia'
    ),
    (
      v_empresa_id,
      'Natalia Vega',
      '0994154627',
      NULL,
      'natalia vega'
    ),
    (
      v_empresa_id,
      'Natalia Vidal',
      '0981353716',
      '10mil',
      'natalia vidal'
    ),
    (
      v_empresa_id,
      'Natalia Zapata',
      '9982184843',
      NULL,
      'natalia zapata'
    ),
    (
      v_empresa_id,
      'Natalin Melgarejo',
      '0984714685',
      NULL,
      'natalin melgarejo'
    ),
    (
      v_empresa_id,
      'Natasha Huttemann',
      '0994916151',
      '10mil',
      'natasha huttemann'
    ),
    (
      v_empresa_id,
      'Nathali',
      '0981366602',
      NULL,
      'nathali'
    ),
    (
      v_empresa_id,
      'Nathali Fidabel',
      '0992683143',
      '10MIL',
      'nathali fidabel'
    ),
    (
      v_empresa_id,
      'Nathali Giesbrecht',
      NULL,
      NULL,
      'nathali giesbrecht'
    ),
    (
      v_empresa_id,
      'Nathalia Acuna',
      '0971208369',
      NULL,
      'nathalia acuna'
    ),
    (
      v_empresa_id,
      'Nathalia Alonso',
      '0981305520',
      NULL,
      'nathalia alonso'
    ),
    (
      v_empresa_id,
      'Nathalia Amarilla',
      '0985515556',
      '10mil',
      'nathalia amarilla'
    ),
    (
      v_empresa_id,
      'Nathalia Ayala',
      '0985859300',
      '20mil',
      'nathalia ayala'
    ),
    (
      v_empresa_id,
      'Nathalia Baez',
      '0981924011',
      NULL,
      'nathalia baez'
    ),
    (
      v_empresa_id,
      'Nathalia Barua',
      '0982286820',
      NULL,
      'nathalia barua'
    ),
    (
      v_empresa_id,
      'Nathalia Bazan',
      '0981314331',
      NULL,
      'nathalia bazan'
    ),
    (
      v_empresa_id,
      'Nathalia Benegas',
      '0982470129',
      '20mil',
      'nathalia benegas'
    ),
    (
      v_empresa_id,
      'Nathalia Benitez',
      '0992927911',
      NULL,
      'nathalia benitez'
    ),
    (
      v_empresa_id,
      'Nathalia Candia',
      '0994152762',
      NULL,
      'nathalia candia'
    ),
    (
      v_empresa_id,
      'Nathalia Delgado',
      '0982109130',
      NULL,
      'nathalia delgado'
    ),
    (
      v_empresa_id,
      'Nathalia Dure',
      '0972285595',
      NULL,
      'nathalia dure'
    ),
    (
      v_empresa_id,
      'Nathalia Figueredo',
      '0982111735',
      '1 selo (8)',
      'nathalia figueredo'
    ),
    (
      v_empresa_id,
      'Nathalia Florentin',
      '0986987031',
      NULL,
      'nathalia florentin'
    ),
    (
      v_empresa_id,
      'Nathalia Gimenez',
      '0991738455',
      NULL,
      'nathalia gimenez'
    ),
    (
      v_empresa_id,
      'Nathalia Gomez',
      '0972105476',
      NULL,
      'nathalia gomez'
    ),
    (
      v_empresa_id,
      'Nathalia Gonzalez',
      '0981124740',
      NULL,
      'nathalia gonzalez'
    ),
    (
      v_empresa_id,
      'Nathalia Grabowski',
      '0981915864',
      '1 selo (1)',
      'nathalia grabowski'
    ),
    (
      v_empresa_id,
      'Nathalia Koopmann',
      '0981924484',
      NULL,
      'nathalia koopmann'
    ),
    (
      v_empresa_id,
      'Nathalia Lovera',
      NULL,
      NULL,
      'nathalia lovera'
    ),
    (
      v_empresa_id,
      'Nathalia Lugen',
      '0973206445',
      NULL,
      'nathalia lugen'
    ),
    (
      v_empresa_id,
      'Nathalia Lujen',
      '0973206447',
      NULL,
      'nathalia lujen'
    ),
    (
      v_empresa_id,
      'Nathalia Marecos',
      '0971424504',
      '1 seli (1)',
      'nathalia marecos'
    ),
    (
      v_empresa_id,
      'Nathalia Martinez',
      '0991473341',
      NULL,
      'nathalia martinez'
    ),
    (
      v_empresa_id,
      'Nathalia Mereles',
      '0991313152',
      NULL,
      'nathalia mereles'
    ),
    (
      v_empresa_id,
      'Nathalia Nery Huerta',
      '0994205080',
      NULL,
      'nathalia nery huerta'
    ),
    (
      v_empresa_id,
      'Nathalia Nunez',
      '0986107560',
      NULL,
      'nathalia nunez'
    ),
    (
      v_empresa_id,
      'Nathalia Ortiz',
      '0981693192',
      NULL,
      'nathalia ortiz'
    ),
    (
      v_empresa_id,
      'Nathalia Peralta',
      '0981969277',
      '10mil',
      'nathalia peralta'
    ),
    (
      v_empresa_id,
      'Nathalia Rodriguez',
      '0972481511',
      NULL,
      'nathalia rodriguez'
    ),
    (
      v_empresa_id,
      'Nathalia Segobia',
      '0983455261',
      NULL,
      'nathalia segobia'
    ),
    (
      v_empresa_id,
      'Nathalie Balansa',
      '0981136291',
      NULL,
      'nathalie balansa'
    ),
    (
      v_empresa_id,
      'Nathalie Giesbrecht',
      '0981366602',
      NULL,
      'nathalie giesbrecht'
    ),
    (
      v_empresa_id,
      'Nathanael Jara',
      '0976106430',
      '10MIL',
      'nathanael jara'
    ),
    (
      v_empresa_id,
      'Nathasha Majul',
      '0976346412',
      '10mil',
      'nathasha majul'
    ),
    (
      v_empresa_id,
      'Natieli Samistraro',
      '0976862155',
      '30mil',
      'natieli samistraro'
    ),
    (
      v_empresa_id,
      'Naura Aguilar',
      '0976501607',
      NULL,
      'naura aguilar'
    ),
    (
      v_empresa_id,
      'Navili Sanabria',
      '9876656967',
      NULL,
      'navili sanabria'
    ),
    (
      v_empresa_id,
      'Nayeli',
      NULL,
      NULL,
      'nayeli'
    ),
    (
      v_empresa_id,
      'Nayeli Baez',
      '0984990842',
      NULL,
      'nayeli baez'
    ),
    (
      v_empresa_id,
      'Nayeli Florentin',
      '0972856007',
      NULL,
      'nayeli florentin'
    ),
    (
      v_empresa_id,
      'Nayeli Lopez',
      '0972619340',
      NULL,
      'nayeli lopez'
    ),
    (
      v_empresa_id,
      'Nayeli Lujan',
      '0976400395',
      NULL,
      'nayeli lujan'
    ),
    (
      v_empresa_id,
      'Nayeli Morinigo',
      '0986438330',
      NULL,
      'nayeli morinigo'
    ),
    (
      v_empresa_id,
      'Nayeli Ortiz',
      '0991217556',
      NULL,
      'nayeli ortiz'
    ),
    (
      v_empresa_id,
      'Nayeli Pereira',
      '0982645657',
      NULL,
      'nayeli pereira'
    ),
    (
      v_empresa_id,
      'Nazarena Lopez',
      '0982386516',
      NULL,
      'nazarena lopez'
    ),
    (
      v_empresa_id,
      'Nazarena Ortiz',
      '0982821254',
      '40mil',
      'nazarena ortiz'
    ),
    (
      v_empresa_id,
      'Neila Fletes',
      '0983156435',
      NULL,
      'neila fletes'
    ),
    (
      v_empresa_id,
      'Nelida',
      '99403661',
      NULL,
      'nelida'
    ),
    (
      v_empresa_id,
      'Nelida Canan',
      '0981354732',
      NULL,
      'nelida canan'
    ),
    (
      v_empresa_id,
      'Nelida Fernandez',
      '0985481006',
      NULL,
      'nelida fernandez'
    ),
    (
      v_empresa_id,
      'Nelly',
      NULL,
      NULL,
      'nelly'
    ),
    (
      v_empresa_id,
      'Nelly Benega',
      '0985175596',
      '1 selo (1)',
      'nelly benega'
    ),
    (
      v_empresa_id,
      'Nelly Fleitas',
      '0986155326',
      NULL,
      'nelly fleitas'
    ),
    (
      v_empresa_id,
      'Nelly Martinez',
      '0981161179',
      NULL,
      'nelly martinez'
    ),
    (
      v_empresa_id,
      'Nelson Aquino',
      '0984843051',
      '10MIL',
      'nelson aquino'
    ),
    (
      v_empresa_id,
      'Nelson Parra',
      '0983811866',
      NULL,
      'nelson parra'
    ),
    (
      v_empresa_id,
      'Nicol Arzamendia',
      '0991447219',
      NULL,
      'nicol arzamendia'
    ),
    (
      v_empresa_id,
      'Nicol Mello',
      '0992431270',
      NULL,
      'nicol mello'
    ),
    (
      v_empresa_id,
      'Nicolas Campos',
      '0986454774',
      NULL,
      'nicolas campos'
    ),
    (
      v_empresa_id,
      'Nicolas Duarte',
      '0982427864',
      NULL,
      'nicolas duarte'
    ),
    (
      v_empresa_id,
      'Nicolas gomez',
      '0981299918',
      '20mil',
      'nicolas gomez'
    ),
    (
      v_empresa_id,
      'Nicolas Kallsen',
      '0986928883',
      NULL,
      'nicolas kallsen'
    ),
    (
      v_empresa_id,
      'Nicolas Piraino',
      '0981060077',
      NULL,
      'nicolas piraino'
    ),
    (
      v_empresa_id,
      'Nicolas Riveros',
      '0992880474',
      NULL,
      'nicolas riveros'
    ),
    (
      v_empresa_id,
      'Nicole Balliian',
      '0994442333',
      NULL,
      'nicole balliian'
    ),
    (
      v_empresa_id,
      'Nicole Cardozo',
      '0994275738',
      NULL,
      'nicole cardozo'
    ),
    (
      v_empresa_id,
      'Nicole Denis',
      '0984202580',
      NULL,
      'nicole denis'
    ),
    (
      v_empresa_id,
      'Nicole Figueredo',
      '0985301421',
      NULL,
      'nicole figueredo'
    ),
    (
      v_empresa_id,
      'Nicole Fretes',
      '0981207210',
      NULL,
      'nicole fretes'
    ),
    (
      v_empresa_id,
      'Nicole Galeano',
      '0983074938',
      NULL,
      'nicole galeano'
    ),
    (
      v_empresa_id,
      'Nicole Lopez',
      '0976166869',
      NULL,
      'nicole lopez'
    ),
    (
      v_empresa_id,
      'Nicole Lurachi',
      '0982986790',
      NULL,
      'nicole lurachi'
    ),
    (
      v_empresa_id,
      'Nicole Monin',
      '0983713657',
      NULL,
      'nicole monin'
    ),
    (
      v_empresa_id,
      'Nicole Rivas',
      '0991518405',
      NULL,
      'nicole rivas'
    ),
    (
      v_empresa_id,
      'Nicole Tocaimaza',
      '0983955633',
      NULL,
      'nicole tocaimaza'
    ),
    (
      v_empresa_id,
      'Nicole Zapata',
      '0972462172',
      NULL,
      'nicole zapata'
    ),
    (
      v_empresa_id,
      'Nidia Arce',
      '0971456406',
      NULL,
      'nidia arce'
    ),
    (
      v_empresa_id,
      'Nidia Ester Caballero',
      '0994312483',
      NULL,
      'nidia ester caballero'
    ),
    (
      v_empresa_id,
      'Nidia Mereles',
      '0994269391',
      NULL,
      'nidia mereles'
    ),
    (
      v_empresa_id,
      'Nidia Otto',
      '0982570813',
      NULL,
      'nidia otto'
    ),
    (
      v_empresa_id,
      'Nidia Rodriguez',
      '0961885567',
      NULL,
      'nidia rodriguez'
    ),
    (
      v_empresa_id,
      'Nidia Samudio',
      '0994269391',
      NULL,
      'nidia samudio'
    ),
    (
      v_empresa_id,
      'Nidia Santacruz',
      '0982783918',
      NULL,
      'nidia santacruz'
    ),
    (
      v_empresa_id,
      'Nidia Sapriza',
      '0971437700',
      '10mil',
      'nidia sapriza'
    ),
    (
      v_empresa_id,
      'Nidia Urbieta',
      '0982990140',
      NULL,
      'nidia urbieta'
    ),
    (
      v_empresa_id,
      'Nieve Gonzalez',
      '0984622623',
      NULL,
      'nieve gonzalez'
    ),
    (
      v_empresa_id,
      'Nieves del Puerto',
      '0986251470',
      '10mil',
      'nieves del puerto'
    ),
    (
      v_empresa_id,
      'Nilda Arguello',
      '0985122370',
      NULL,
      'nilda arguello'
    ),
    (
      v_empresa_id,
      'Nilda Ramos',
      '0976151382',
      '1 selo (1)',
      'nilda ramos'
    ),
    (
      v_empresa_id,
      'Nilda Rotela',
      '0985924098',
      NULL,
      'nilda rotela'
    ),
    (
      v_empresa_id,
      'Nilda Villalba',
      '0985639689',
      NULL,
      'nilda villalba'
    ),
    (
      v_empresa_id,
      'Nilsa Aguiar',
      '0972870100',
      NULL,
      'nilsa aguiar'
    ),
    (
      v_empresa_id,
      'Nilsa Bogado',
      '0982120436',
      NULL,
      'nilsa bogado'
    ),
    (
      v_empresa_id,
      'Nilsa Cabreara',
      '0986853617',
      NULL,
      'nilsa cabreara'
    ),
    (
      v_empresa_id,
      'Nilsa Garcete',
      '0986410456',
      NULL,
      'nilsa garcete'
    ),
    (
      v_empresa_id,
      'Nilsa Mareco',
      '0973634662',
      '40MIL',
      'nilsa mareco'
    ),
    (
      v_empresa_id,
      'Nilsa Morel',
      '0981895326',
      NULL,
      'nilsa morel'
    ),
    (
      v_empresa_id,
      'Nilsa Moreno',
      '0981895326',
      NULL,
      'nilsa moreno'
    ),
    (
      v_empresa_id,
      'Nilsa Paez',
      '0991927975',
      '1 selo (1)',
      'nilsa paez'
    ),
    (
      v_empresa_id,
      'Nilsa Rivas',
      '0981765047',
      '10MIL',
      'nilsa rivas'
    ),
    (
      v_empresa_id,
      'Nilse Duarte',
      '0986807931',
      NULL,
      'nilse duarte'
    ),
    (
      v_empresa_id,
      'Nilse Insaurralde',
      '9817773903',
      '10mil',
      'nilse insaurralde'
    ),
    (
      v_empresa_id,
      'Nilson Bogado',
      '0994888323',
      NULL,
      'nilson bogado'
    ),
    (
      v_empresa_id,
      'Nilza Morel',
      '0981895226',
      NULL,
      'nilza morel'
    ),
    (
      v_empresa_id,
      'Nilza Sarde',
      '0983600035',
      NULL,
      'nilza sarde'
    ),
    (
      v_empresa_id,
      'Nine nien CDE',
      NULL,
      NULL,
      'nine nien cde'
    ),
    (
      v_empresa_id,
      'Ninfa Ferreira',
      '0981576990',
      NULL,
      'ninfa ferreira'
    ),
    (
      v_empresa_id,
      'Nisia arajez',
      '0974579103',
      NULL,
      'nisia arajez'
    ),
    (
      v_empresa_id,
      'Nivia Farina',
      '0991704059',
      NULL,
      'nivia farina'
    ),
    (
      v_empresa_id,
      'Noelia Anoa',
      '0991984277',
      NULL,
      'noelia anoa'
    ),
    (
      v_empresa_id,
      'Noelia Armoa',
      '0985506141',
      NULL,
      'noelia armoa'
    ),
    (
      v_empresa_id,
      'Noelia Ayala',
      '0994343159',
      '10mil',
      'noelia ayala'
    ),
    (
      v_empresa_id,
      'Noelia Beatris Leon',
      '0981212930',
      NULL,
      'noelia beatris leon'
    ),
    (
      v_empresa_id,
      'Noelia Benitez',
      '0994447496',
      NULL,
      'noelia benitez'
    ),
    (
      v_empresa_id,
      'Noelia Cabrera',
      '0991844248',
      NULL,
      'noelia cabrera'
    ),
    (
      v_empresa_id,
      'Noelia Castillo',
      '0975121120',
      NULL,
      'noelia castillo'
    ),
    (
      v_empresa_id,
      'Noelia Conteiro',
      '0971982726',
      NULL,
      'noelia conteiro'
    ),
    (
      v_empresa_id,
      'Noelia Denis',
      '0986401684',
      NULL,
      'noelia denis'
    ),
    (
      v_empresa_id,
      'Noelia Diaz',
      '0972702181',
      NULL,
      'noelia diaz'
    ),
    (
      v_empresa_id,
      'Noelia Dugo',
      '0984703236',
      '30mil',
      'noelia dugo'
    ),
    (
      v_empresa_id,
      'Noelia Gonzalez',
      '0972119199',
      NULL,
      'noelia gonzalez'
    ),
    (
      v_empresa_id,
      'Noelia Leon',
      '0981212930',
      NULL,
      'noelia leon'
    ),
    (
      v_empresa_id,
      'Noelia Lezcano',
      '0984703100',
      '1 selo (1)',
      'noelia lezcano'
    ),
    (
      v_empresa_id,
      'Noelia Marecos',
      '0961306674',
      NULL,
      'noelia marecos'
    ),
    (
      v_empresa_id,
      'Noelia Moura',
      '0971650580',
      '10mil',
      'noelia moura'
    ),
    (
      v_empresa_id,
      'Noelia Mrecos',
      '0961306674',
      NULL,
      'noelia mrecos'
    ),
    (
      v_empresa_id,
      'Noelia Orue',
      '0986243363',
      '30mil',
      'noelia orue'
    ),
    (
      v_empresa_id,
      'Noelia Ovelar',
      '0984844539',
      NULL,
      'noelia ovelar'
    ),
    (
      v_empresa_id,
      'Noelia Perez',
      '0981549378',
      NULL,
      'noelia perez'
    ),
    (
      v_empresa_id,
      'Noelia Pinto',
      '0981310024',
      NULL,
      'noelia pinto'
    ),
    (
      v_empresa_id,
      'Noelia Romero',
      '0994540959',
      NULL,
      'noelia romero'
    ),
    (
      v_empresa_id,
      'Noelia Rue',
      '0986243369',
      '10MIL',
      'noelia rue'
    ),
    (
      v_empresa_id,
      'Noelia Salinas',
      '0975766653',
      NULL,
      'noelia salinas'
    ),
    (
      v_empresa_id,
      'Noelia Samaniego',
      '0986646758',
      NULL,
      'noelia samaniego'
    ),
    (
      v_empresa_id,
      'Noelia Segovia',
      '0994273043',
      NULL,
      'noelia segovia'
    ),
    (
      v_empresa_id,
      'Noelia Silva',
      '0992951471',
      NULL,
      'noelia silva'
    ),
    (
      v_empresa_id,
      'Noelia Soria',
      '0961897630',
      NULL,
      'noelia soria'
    ),
    (
      v_empresa_id,
      'Noelia Villalba',
      '0981439788',
      NULL,
      'noelia villalba'
    ),
    (
      v_empresa_id,
      'Noelia Zaracho',
      '0983465672',
      NULL,
      'noelia zaracho'
    ),
    (
      v_empresa_id,
      'Noema Benitez',
      '0981954229',
      NULL,
      'noema benitez'
    ),
    (
      v_empresa_id,
      'Noemi Alvarenga',
      '0993375269',
      NULL,
      'noemi alvarenga'
    ),
    (
      v_empresa_id,
      'Noemi Azcona',
      '0976819269',
      NULL,
      'noemi azcona'
    ),
    (
      v_empresa_id,
      'Noemi Galeano',
      '0993315048',
      NULL,
      'noemi galeano'
    ),
    (
      v_empresa_id,
      'Noemi Melgarejo',
      '0972507614',
      NULL,
      'noemi melgarejo'
    ),
    (
      v_empresa_id,
      'Noemi Miranda',
      '0972525346',
      NULL,
      'noemi miranda'
    ),
    (
      v_empresa_id,
      'Noemi Nunes',
      '0981570176',
      NULL,
      'noemi nunes'
    ),
    (
      v_empresa_id,
      'Noemi Ortiz',
      '0971794840',
      '10mil',
      'noemi ortiz'
    ),
    (
      v_empresa_id,
      'Noemi Vidanda',
      '0972525346',
      NULL,
      'noemi vidanda'
    ),
    (
      v_empresa_id,
      'Nona Conolan',
      '0971743800',
      NULL,
      'nona conolan'
    ),
    (
      v_empresa_id,
      'Nora Escobar',
      '0981595409',
      NULL,
      'nora escobar'
    ),
    (
      v_empresa_id,
      'Nora Insfran',
      '0991873899',
      '30mil',
      'nora insfran'
    ),
    (
      v_empresa_id,
      'Norma Acosta',
      '0981525863',
      NULL,
      'norma acosta'
    ),
    (
      v_empresa_id,
      'Norma Benitez',
      '0981597463',
      NULL,
      'norma benitez'
    ),
    (
      v_empresa_id,
      'Norma Flores',
      '0984285098',
      NULL,
      'norma flores'
    ),
    (
      v_empresa_id,
      'Norma Gimenez',
      '0985713116',
      NULL,
      'norma gimenez'
    ),
    (
      v_empresa_id,
      'Norma Marizo',
      '0981938221',
      NULL,
      'norma marizo'
    ),
    (
      v_empresa_id,
      'Norma Martinez',
      '0972736923',
      '10mil',
      'norma martinez'
    ),
    (
      v_empresa_id,
      'Norma Ojeda',
      '0982709275',
      NULL,
      'norma ojeda'
    ),
    (
      v_empresa_id,
      'Norma Rios',
      '0984783582',
      NULL,
      'norma rios'
    ),
    (
      v_empresa_id,
      'Nuria Ojeda',
      '0971846532',
      '10mil',
      'nuria ojeda'
    ),
    (
      v_empresa_id,
      'Oamar Sosa',
      '0976571864',
      '10mil',
      'oamar sosa'
    ),
    (
      v_empresa_id,
      'Ofelia Maciel',
      '0992884949',
      NULL,
      'ofelia maciel'
    ),
    (
      v_empresa_id,
      'Olga Barrios',
      '0981186124',
      NULL,
      'olga barrios'
    ),
    (
      v_empresa_id,
      'Olga Benitez',
      '0984644998',
      NULL,
      'olga benitez'
    ),
    (
      v_empresa_id,
      'Olga Cantero',
      '0991514626',
      NULL,
      'olga cantero'
    ),
    (
      v_empresa_id,
      'Olga Maldonado',
      '0981743687',
      NULL,
      'olga maldonado'
    ),
    (
      v_empresa_id,
      'Olga Paredes',
      '0972684080',
      NULL,
      'olga paredes'
    ),
    (
      v_empresa_id,
      'Olga Ugarte',
      '0994638112',
      NULL,
      'olga ugarte'
    ),
    (
      v_empresa_id,
      'Oliver Ramirez',
      '0992229309',
      NULL,
      'oliver ramirez'
    ),
    (
      v_empresa_id,
      'Olivia Berendsohn',
      '0986795805',
      NULL,
      'olivia berendsohn'
    ),
    (
      v_empresa_id,
      'Olivia Vega',
      '0982241010',
      '20MIL',
      'olivia vega'
    ),
    (
      v_empresa_id,
      'Omar Balbuena',
      '0981629281',
      '1OMIL',
      'omar balbuena'
    ),
    (
      v_empresa_id,
      'Omar Vinones',
      '0981293353',
      NULL,
      'omar vinones'
    ),
    (
      v_empresa_id,
      'Oracio Centurion',
      '0961634773',
      '30mil',
      'oracio centurion'
    ),
    (
      v_empresa_id,
      'Orfa Diaz',
      '0981709139',
      '40mil',
      'orfa diaz'
    ),
    (
      v_empresa_id,
      'Oriana Robledo',
      '0994886893',
      NULL,
      'oriana robledo'
    ),
    (
      v_empresa_id,
      'Ornella Ferreira',
      '0994565387',
      NULL,
      'ornella ferreira'
    ),
    (
      v_empresa_id,
      'Ornella Mendoza',
      '0984794040',
      '40MIL',
      'ornella mendoza'
    ),
    (
      v_empresa_id,
      'Osacar Arzamendia',
      '0971263896',
      NULL,
      'osacar arzamendia'
    ),
    (
      v_empresa_id,
      'Oscar Aguero',
      '0985670552',
      NULL,
      'oscar aguero'
    ),
    (
      v_empresa_id,
      'Oscar Arellano',
      '0975782519',
      '30MIL',
      'oscar arellano'
    ),
    (
      v_empresa_id,
      'Oscar Ariel Fleitas',
      '0984245103',
      '10mil',
      'oscar ariel fleitas'
    ),
    (
      v_empresa_id,
      'Oscar Godoy',
      '0961424481',
      NULL,
      'oscar godoy'
    ),
    (
      v_empresa_id,
      'Oscar Rodriguez',
      '0971730141',
      NULL,
      'oscar rodriguez'
    ),
    (
      v_empresa_id,
      'Oshkosh Juliana',
      NULL,
      NULL,
      'oshkosh juliana'
    ),
    (
      v_empresa_id,
      'Osmar Aguilar',
      '0992439570',
      '10mil',
      'osmar aguilar'
    ),
    (
      v_empresa_id,
      'Osmar Sosa',
      '0976571864',
      '10mil',
      'osmar sosa'
    ),
    (
      v_empresa_id,
      'Osmarlyn Sambrano',
      '0981072666',
      NULL,
      'osmarlyn sambrano'
    ),
    (
      v_empresa_id,
      'Osvaldo Acosta',
      '0986949203',
      NULL,
      'osvaldo acosta'
    ),
    (
      v_empresa_id,
      'Osvaldo Espinola',
      '0971978168',
      NULL,
      'osvaldo espinola'
    ),
    (
      v_empresa_id,
      'Ower Amarilla',
      '0983186042',
      NULL,
      'ower amarilla'
    ),
    (
      v_empresa_id,
      'Pablo Bravo',
      '0992434170',
      NULL,
      'pablo bravo'
    ),
    (
      v_empresa_id,
      'Pablo Gonzalez',
      '0971524208',
      '10MIL',
      'pablo gonzalez'
    ),
    (
      v_empresa_id,
      'Pablo Posteguillo',
      '0991957360',
      NULL,
      'pablo posteguillo'
    ),
    (
      v_empresa_id,
      'Pablo roa',
      '0981262626',
      NULL,
      'pablo roa'
    ),
    (
      v_empresa_id,
      'Paloma Brugada',
      '0981879551',
      NULL,
      'paloma brugada'
    ),
    (
      v_empresa_id,
      'Paloma Calderon',
      '0983832125',
      '20mil',
      'paloma calderon'
    ),
    (
      v_empresa_id,
      'Paloma Easpinola',
      '0991725910',
      NULL,
      'paloma easpinola'
    ),
    (
      v_empresa_id,
      'Paloma Perez',
      '0991591885',
      NULL,
      'paloma perez'
    ),
    (
      v_empresa_id,
      'Paloma Segovia',
      '0987196710',
      NULL,
      'paloma segovia'
    ),
    (
      v_empresa_id,
      'Paloma Velaztiqui',
      '0976851624',
      NULL,
      'paloma velaztiqui'
    ),
    (
      v_empresa_id,
      'Paloma Villa',
      '0981958502',
      NULL,
      'paloma villa'
    ),
    (
      v_empresa_id,
      'Paloma Villalba',
      '0981958502',
      NULL,
      'paloma villalba'
    ),
    (
      v_empresa_id,
      'Paloma Villasboa',
      '0981958502',
      '1selo (1)',
      'paloma villasboa'
    ),
    (
      v_empresa_id,
      'Pamela acuna',
      '0971356656',
      NULL,
      'pamela acuna'
    ),
    (
      v_empresa_id,
      'Pamela Alvarez',
      '0986247011',
      NULL,
      'pamela alvarez'
    ),
    (
      v_empresa_id,
      'Pamela Ayala',
      '0985778052',
      NULL,
      'pamela ayala'
    ),
    (
      v_empresa_id,
      'Pamela Benitez',
      '0976479125',
      NULL,
      'pamela benitez'
    ),
    (
      v_empresa_id,
      'Pamela Campos',
      '0983566662',
      '30mil',
      'pamela campos'
    ),
    (
      v_empresa_id,
      'Pamela Dahiana',
      '0986829444',
      NULL,
      'pamela dahiana'
    ),
    (
      v_empresa_id,
      'Pamela Duarte',
      '0976349825',
      NULL,
      'pamela duarte'
    ),
    (
      v_empresa_id,
      'Pamela Encina',
      '0994534184',
      NULL,
      'pamela encina'
    ),
    (
      v_empresa_id,
      'Pamela Ferreira',
      '0991827741',
      NULL,
      'pamela ferreira'
    ),
    (
      v_empresa_id,
      'Pamela Figueredo',
      '0971236270',
      NULL,
      'pamela figueredo'
    ),
    (
      v_empresa_id,
      'Pamela Fretes',
      '0994153639',
      NULL,
      'pamela fretes'
    ),
    (
      v_empresa_id,
      'Pamela Garcia',
      '0986695978',
      NULL,
      'pamela garcia'
    ),
    (
      v_empresa_id,
      'Pamela Gavilan',
      '0981957215',
      NULL,
      'pamela gavilan'
    ),
    (
      v_empresa_id,
      'Pamela Gonzales',
      '0991778749',
      NULL,
      'pamela gonzales'
    ),
    (
      v_empresa_id,
      'Pamela Gonzalez',
      '0971360130',
      '10mil',
      'pamela gonzalez'
    ),
    (
      v_empresa_id,
      'Pamela Gracia',
      '0984952980',
      NULL,
      'pamela gracia'
    ),
    (
      v_empresa_id,
      'Pamela Guzman',
      '59175090022',
      NULL,
      'pamela guzman'
    ),
    (
      v_empresa_id,
      'Pamela Lopez',
      '0981999212',
      NULL,
      'pamela lopez'
    ),
    (
      v_empresa_id,
      'Pamela Marchi',
      '0981240232',
      '1 selo (1)',
      'pamela marchi'
    ),
    (
      v_empresa_id,
      'Pamela Medina',
      '0992558803',
      NULL,
      'pamela medina'
    ),
    (
      v_empresa_id,
      'Pamela Mendieta',
      NULL,
      NULL,
      'pamela mendieta'
    ),
    (
      v_empresa_id,
      'Pamela Nicol Cristaldo',
      '0985348366',
      '20MIL',
      'pamela nicol cristaldo'
    ),
    (
      v_empresa_id,
      'Pamela Nunez',
      '0992430843',
      NULL,
      'pamela nunez'
    ),
    (
      v_empresa_id,
      'Pamela Ortiz',
      '0986117392',
      '1 selo (1)',
      'pamela ortiz'
    ),
    (
      v_empresa_id,
      'Pamela Palma',
      '0971403346',
      NULL,
      'pamela palma'
    ),
    (
      v_empresa_id,
      'Pamela Perez',
      '0981808729',
      NULL,
      'pamela perez'
    ),
    (
      v_empresa_id,
      'Pamela Pinhanez',
      '0991928231',
      NULL,
      'pamela pinhanez'
    ),
    (
      v_empresa_id,
      'Pamela Recalde',
      '0994752286',
      NULL,
      'pamela recalde'
    ),
    (
      v_empresa_id,
      'Pamela Ricalde',
      '0994752286',
      NULL,
      'pamela ricalde'
    ),
    (
      v_empresa_id,
      'Pamela Riquelme',
      '0981280181',
      '20mil+30mil',
      'pamela riquelme'
    ),
    (
      v_empresa_id,
      'Pamela Riveros',
      '0975135868',
      NULL,
      'pamela riveros'
    ),
    (
      v_empresa_id,
      'Pamela Roda',
      '0994683638',
      '30mil',
      'pamela roda'
    ),
    (
      v_empresa_id,
      'Pamela Roig',
      '0972267364',
      NULL,
      'pamela roig'
    ),
    (
      v_empresa_id,
      'Pamela Roman',
      '0991858523',
      NULL,
      'pamela roman'
    ),
    (
      v_empresa_id,
      'Pamela Royg',
      '0972267364',
      NULL,
      'pamela royg'
    ),
    (
      v_empresa_id,
      'Pamela Salinas',
      '0994763252',
      NULL,
      'pamela salinas'
    ),
    (
      v_empresa_id,
      'Pamela Torres',
      '0981245831',
      NULL,
      'pamela torres'
    ),
    (
      v_empresa_id,
      'Panambi Recalde',
      '0991860757',
      NULL,
      'panambi recalde'
    ),
    (
      v_empresa_id,
      'Paola',
      NULL,
      NULL,
      'paola'
    ),
    (
      v_empresa_id,
      'Paola Alonzo',
      '0971244177',
      NULL,
      'paola alonzo'
    ),
    (
      v_empresa_id,
      'Paola Alujas',
      '0983192054',
      '30mil',
      'paola alujas'
    ),
    (
      v_empresa_id,
      'Paola Ayala',
      '0971182600',
      NULL,
      'paola ayala'
    ),
    (
      v_empresa_id,
      'Paola Baez',
      '0971867544',
      '10mil',
      'paola baez'
    ),
    (
      v_empresa_id,
      'Paola Britez',
      '0983491120',
      NULL,
      'paola britez'
    ),
    (
      v_empresa_id,
      'Paola Chena',
      '0984504344',
      NULL,
      'paola chena'
    ),
    (
      v_empresa_id,
      'Paola Cibils',
      '0981533525',
      NULL,
      'paola cibils'
    ),
    (
      v_empresa_id,
      'Paola Cristaldo',
      '0972175524',
      NULL,
      'paola cristaldo'
    ),
    (
      v_empresa_id,
      'Paola Diaz',
      '9922228549',
      '10mil',
      'paola diaz'
    ),
    (
      v_empresa_id,
      'Paola Dominguez',
      '0972664360',
      '10mil',
      'paola dominguez'
    ),
    (
      v_empresa_id,
      'Paola Duarte',
      '0972578144',
      NULL,
      'paola duarte'
    ),
    (
      v_empresa_id,
      'Paola Espinola',
      '0986350549',
      NULL,
      'paola espinola'
    ),
    (
      v_empresa_id,
      'Paola Evers',
      '0981655421',
      NULL,
      'paola evers'
    ),
    (
      v_empresa_id,
      'Paola Ferrer',
      '0981892236',
      NULL,
      'paola ferrer'
    ),
    (
      v_empresa_id,
      'Paola Gonzalez',
      '0982436234',
      NULL,
      'paola gonzalez'
    ),
    (
      v_empresa_id,
      'Paola Jimenez',
      '0984575577',
      NULL,
      'paola jimenez'
    ),
    (
      v_empresa_id,
      'Paola Leiba',
      '0981811610',
      NULL,
      'paola leiba'
    ),
    (
      v_empresa_id,
      'Paola Leiva',
      '0976113385',
      '1 selo (1)',
      'paola leiva'
    ),
    (
      v_empresa_id,
      'Paola Martinez',
      '0992290598',
      NULL,
      'paola martinez'
    ),
    (
      v_empresa_id,
      'Paola Mendedeti',
      '0991482048',
      NULL,
      'paola mendedeti'
    ),
    (
      v_empresa_id,
      'Paola Meza',
      '0992312917',
      NULL,
      'paola meza'
    ),
    (
      v_empresa_id,
      'Paola Ortega',
      '0986266358',
      '20MIL',
      'paola ortega'
    ),
    (
      v_empresa_id,
      'Paola Paiva',
      '9945507310',
      NULL,
      'paola paiva'
    ),
    (
      v_empresa_id,
      'Paola Pintos',
      '0982588037',
      NULL,
      'paola pintos'
    ),
    (
      v_empresa_id,
      'Paola Rolon',
      '0994345542',
      NULL,
      'paola rolon'
    ),
    (
      v_empresa_id,
      'Paola Salinas',
      '0981287916',
      NULL,
      'paola salinas'
    ),
    (
      v_empresa_id,
      'Paola Sanchez',
      '0983591267',
      NULL,
      'paola sanchez'
    ),
    (
      v_empresa_id,
      'Paola Sandobal',
      '0991440420',
      NULL,
      'paola sandobal'
    ),
    (
      v_empresa_id,
      'Paola Santos',
      NULL,
      NULL,
      'paola santos'
    ),
    (
      v_empresa_id,
      'Paola Torales',
      '0971173748',
      NULL,
      'paola torales'
    ),
    (
      v_empresa_id,
      'Paola Vega',
      '0986633222',
      NULL,
      'paola vega'
    ),
    (
      v_empresa_id,
      'paq 3 prendas lyf 18 y 24',
      NULL,
      NULL,
      'paq 3 prendas lyf 18 y 24'
    ),
    (
      v_empresa_id,
      'Patricia',
      NULL,
      NULL,
      'patricia'
    ),
    (
      v_empresa_id,
      'Patricia Almando',
      NULL,
      NULL,
      'patricia almando'
    ),
    (
      v_empresa_id,
      'Patricia Alvarez',
      '0984870487',
      '1 selo (1)',
      'patricia alvarez'
    ),
    (
      v_empresa_id,
      'Patricia Arguello',
      '0971863520',
      NULL,
      'patricia arguello'
    ),
    (
      v_empresa_id,
      'Patricia Baez',
      '0971953535',
      NULL,
      'patricia baez'
    ),
    (
      v_empresa_id,
      'Patricia Bareiro',
      '0991684166',
      NULL,
      'patricia bareiro'
    ),
    (
      v_empresa_id,
      'Patricia Barrios',
      '0984803716',
      NULL,
      'patricia barrios'
    ),
    (
      v_empresa_id,
      'Patricia Benitez',
      '0991501520',
      NULL,
      'patricia benitez'
    ),
    (
      v_empresa_id,
      'Patricia Billasboa',
      NULL,
      NULL,
      'patricia billasboa'
    ),
    (
      v_empresa_id,
      'Patricia Bogarin',
      '0991701817',
      NULL,
      'patricia bogarin'
    ),
    (
      v_empresa_id,
      'Patricia Bussorelli',
      '0982850049',
      NULL,
      'patricia bussorelli'
    ),
    (
      v_empresa_id,
      'Patricia Caballero',
      '0984806207',
      NULL,
      'patricia caballero'
    ),
    (
      v_empresa_id,
      'Patricia Cabrera',
      '0995647939',
      '1 selo (1)',
      'patricia cabrera'
    ),
    (
      v_empresa_id,
      'Patricia Chaparro',
      '0961787643',
      NULL,
      'patricia chaparro'
    ),
    (
      v_empresa_id,
      'Patricia Cristaldo',
      '0976127460',
      NULL,
      'patricia cristaldo'
    ),
    (
      v_empresa_id,
      'Patricia Dejesus',
      '0994342549',
      NULL,
      'patricia dejesus'
    ),
    (
      v_empresa_id,
      'Patricia Diaz',
      '0985540977',
      NULL,
      'patricia diaz'
    ),
    (
      v_empresa_id,
      'Patricia Duarte',
      '0986318987',
      NULL,
      'patricia duarte'
    ),
    (
      v_empresa_id,
      'Patricia Escauriza',
      '0984984276',
      '10MIL',
      'patricia escauriza'
    ),
    (
      v_empresa_id,
      'Patricia Farinha',
      '0972103930',
      NULL,
      'patricia farinha'
    ),
    (
      v_empresa_id,
      'Patricia Ferreira',
      '0981952327',
      NULL,
      'patricia ferreira'
    ),
    (
      v_empresa_id,
      'Patricia Flecha',
      '0984655261',
      '1 selo (1)',
      'patricia flecha'
    ),
    (
      v_empresa_id,
      'Patricia Gamarra',
      '0976941637',
      NULL,
      'patricia gamarra'
    ),
    (
      v_empresa_id,
      'Patricia Garcete',
      '0982198547',
      NULL,
      'patricia garcete'
    ),
    (
      v_empresa_id,
      'Patricia Gauto',
      '0994980552',
      NULL,
      'patricia gauto'
    ),
    (
      v_empresa_id,
      'Patricia Gimenez',
      '0974609249',
      NULL,
      'patricia gimenez'
    ),
    (
      v_empresa_id,
      'Patricia Gomez',
      '0981151092',
      NULL,
      'patricia gomez'
    ),
    (
      v_empresa_id,
      'Patricia Gonzalez',
      '0981637053',
      NULL,
      'patricia gonzalez'
    ),
    (
      v_empresa_id,
      'Patricia Gray',
      '0981134859',
      NULL,
      'patricia gray'
    ),
    (
      v_empresa_id,
      'Patricia Heinrichs',
      '0971247798',
      NULL,
      'patricia heinrichs'
    ),
    (
      v_empresa_id,
      'Patricia Ibarra',
      '0973377306',
      NULL,
      'patricia ibarra'
    ),
    (
      v_empresa_id,
      'Patricia Jara',
      '0983675900',
      '10MIL',
      'patricia jara'
    ),
    (
      v_empresa_id,
      'Patricia Lausekers',
      NULL,
      NULL,
      'patricia lausekers'
    ),
    (
      v_empresa_id,
      'Patricia Llano',
      '0981423730',
      NULL,
      'patricia llano'
    ),
    (
      v_empresa_id,
      'Patricia Lopez',
      '0971194990',
      NULL,
      'patricia lopez'
    ),
    (
      v_empresa_id,
      'Patricia Maida',
      '0987303338',
      NULL,
      'patricia maida'
    ),
    (
      v_empresa_id,
      'Patricia Maidana Recalde',
      '0972146914',
      NULL,
      'patricia maidana recalde'
    ),
    (
      v_empresa_id,
      'Patricia Martinez',
      '0983385739',
      NULL,
      'patricia martinez'
    ),
    (
      v_empresa_id,
      'Patricia Medina',
      '0984034400',
      NULL,
      'patricia medina'
    ),
    (
      v_empresa_id,
      'Patricia Mendoza',
      '0982594843',
      NULL,
      'patricia mendoza'
    ),
    (
      v_empresa_id,
      'Patricia Mongelos',
      '0981773054',
      NULL,
      'patricia mongelos'
    ),
    (
      v_empresa_id,
      'Patricia Mora',
      '0971324891',
      NULL,
      'patricia mora'
    ),
    (
      v_empresa_id,
      'Patricia Nunhez',
      '0984751495',
      '10mil',
      'patricia nunhez'
    ),
    (
      v_empresa_id,
      'Patricia Ovelar',
      '0992350478',
      '30mil',
      'patricia ovelar'
    ),
    (
      v_empresa_id,
      'Patricia Paniagua',
      '0971803925',
      '30MIL',
      'patricia paniagua'
    ),
    (
      v_empresa_id,
      'Patricia Patino',
      '0981908788',
      NULL,
      'patricia patino'
    ),
    (
      v_empresa_id,
      'Patricia Pereira',
      '0981130833',
      NULL,
      'patricia pereira'
    ),
    (
      v_empresa_id,
      'Patricia Perez',
      '99447349',
      '10MIL',
      'patricia perez'
    ),
    (
      v_empresa_id,
      'Patricia Petzoldt',
      '0971330025',
      NULL,
      'patricia petzoldt'
    ),
    (
      v_empresa_id,
      'Patricia Pineda',
      '0981809237',
      '1 selo (2)',
      'patricia pineda'
    ),
    (
      v_empresa_id,
      'Patricia Placios',
      '0981654138',
      NULL,
      'patricia placios'
    ),
    (
      v_empresa_id,
      'Patricia Quintana',
      '0981243609',
      NULL,
      'patricia quintana'
    ),
    (
      v_empresa_id,
      'Patricia Ramirez',
      '0971874505',
      '1 selo (6)',
      'patricia ramirez'
    ),
    (
      v_empresa_id,
      'Patricia Recalde',
      '0982771160',
      NULL,
      'patricia recalde'
    ),
    (
      v_empresa_id,
      'Patricia Recalde Martines',
      '0982771160',
      NULL,
      'patricia recalde martines'
    ),
    (
      v_empresa_id,
      'Patricia Rocher',
      '0981225404',
      NULL,
      'patricia rocher'
    ),
    (
      v_empresa_id,
      'Patricia Rodriguez',
      '0982703079',
      NULL,
      'patricia rodriguez'
    ),
    (
      v_empresa_id,
      'Patricia Rolon',
      '0971533335',
      NULL,
      'patricia rolon'
    ),
    (
      v_empresa_id,
      'Patricia Sanchez',
      '0991404160',
      NULL,
      'patricia sanchez'
    ),
    (
      v_empresa_id,
      'Patricia Sap',
      '0985140785',
      NULL,
      'patricia sap'
    ),
    (
      v_empresa_id,
      'Patricia Silva',
      '0984744583',
      '10MIL',
      'patricia silva'
    ),
    (
      v_empresa_id,
      'Patricia Sosa',
      '0981884934',
      NULL,
      'patricia sosa'
    ),
    (
      v_empresa_id,
      'Patricia Thonzaca',
      '0983900046',
      NULL,
      'patricia thonzaca'
    ),
    (
      v_empresa_id,
      'Patricia Torres',
      '0991493789',
      NULL,
      'patricia torres'
    ),
    (
      v_empresa_id,
      'Patricia Vera',
      '0982798402',
      NULL,
      'patricia vera'
    ),
    (
      v_empresa_id,
      'Patricia Villasboa',
      '0985713432',
      NULL,
      'patricia villasboa'
    ),
    (
      v_empresa_id,
      'Patricia Yegros',
      '0971112262',
      NULL,
      'patricia yegros'
    ),
    (
      v_empresa_id,
      'Paula',
      NULL,
      '30MIL',
      'paula'
    ),
    (
      v_empresa_id,
      'Paula Apuril',
      '0985130782',
      NULL,
      'paula apuril'
    ),
    (
      v_empresa_id,
      'Paula Arias',
      '0986417737',
      NULL,
      'paula arias'
    ),
    (
      v_empresa_id,
      'Paula Aris',
      '0986417737',
      '10mil',
      'paula aris'
    ),
    (
      v_empresa_id,
      'Paula Avila',
      '0983300102',
      NULL,
      'paula avila'
    ),
    (
      v_empresa_id,
      'Paula Cairlece',
      '0972135980',
      '30mil',
      'paula cairlece'
    ),
    (
      v_empresa_id,
      'Paula Diaz',
      '0983034800',
      '30mil',
      'paula diaz'
    ),
    (
      v_empresa_id,
      'Paula Figueredo',
      '0981176299',
      NULL,
      'paula figueredo'
    ),
    (
      v_empresa_id,
      'Paula Florentin',
      '0981877174',
      '1 selo (1)',
      'paula florentin'
    ),
    (
      v_empresa_id,
      'Paula Isasi',
      '0985597400',
      NULL,
      'paula isasi'
    ),
    (
      v_empresa_id,
      'Paula Llanes',
      '0992488633',
      '10mil',
      'paula llanes'
    ),
    (
      v_empresa_id,
      'Paula Lopez',
      '0981853950',
      NULL,
      'paula lopez'
    ),
    (
      v_empresa_id,
      'Paula Mercado',
      '0984816697',
      NULL,
      'paula mercado'
    ),
    (
      v_empresa_id,
      'Paula Moran',
      '0982500193',
      NULL,
      'paula moran'
    ),
    (
      v_empresa_id,
      'Paula Nunez',
      '0961805132',
      NULL,
      'paula nunez'
    ),
    (
      v_empresa_id,
      'Paula Oviedo',
      '0971654102',
      NULL,
      'paula oviedo'
    ),
    (
      v_empresa_id,
      'Paula Pessoa',
      '0982200031',
      NULL,
      'paula pessoa'
    ),
    (
      v_empresa_id,
      'Paula Recalde',
      '0984956065',
      '20MIL',
      'paula recalde'
    ),
    (
      v_empresa_id,
      'Paula Sausedo',
      '0983144150',
      NULL,
      'paula sausedo'
    ),
    (
      v_empresa_id,
      'Paula Silvero',
      '0984187304',
      NULL,
      'paula silvero'
    ),
    (
      v_empresa_id,
      'Paula Wagenr',
      '0985937699',
      NULL,
      'paula wagenr'
    ),
    (
      v_empresa_id,
      'Paula Zalazar',
      '0994718956',
      NULL,
      'paula zalazar'
    ),
    (
      v_empresa_id,
      'Paulina Gonzalez',
      '0974571357',
      NULL,
      'paulina gonzalez'
    ),
    (
      v_empresa_id,
      'Paulina Zarate',
      '0982951570',
      NULL,
      'paulina zarate'
    ),
    (
      v_empresa_id,
      'Pauline Saldivar',
      '0983757979',
      NULL,
      'pauline saldivar'
    ),
    (
      v_empresa_id,
      'Paz Aveiro',
      '0991359834',
      NULL,
      'paz aveiro'
    ),
    (
      v_empresa_id,
      'Paz Barreto',
      '0991878439',
      NULL,
      'paz barreto'
    ),
    (
      v_empresa_id,
      'Paz Domingues',
      '0981512338',
      NULL,
      'paz domingues'
    ),
    (
      v_empresa_id,
      'Paz Lier',
      '0982744387',
      NULL,
      'paz lier'
    ),
    (
      v_empresa_id,
      'Paz Lird',
      '0982744387',
      NULL,
      'paz lird'
    ),
    (
      v_empresa_id,
      'Paz Patino',
      '0981908788',
      NULL,
      'paz patino'
    ),
    (
      v_empresa_id,
      'Pedro Alvarez',
      '0971897140',
      NULL,
      'pedro alvarez'
    ),
    (
      v_empresa_id,
      'Pedro Ricardo Bobadilla',
      '0991334457',
      '10mil',
      'pedro ricardo bobadilla'
    ),
    (
      v_empresa_id,
      'Pela Olmedo',
      '97237831',
      NULL,
      'pela olmedo'
    ),
    (
      v_empresa_id,
      'Pelagia Gonzalez',
      '0981590138',
      NULL,
      'pelagia gonzalez'
    ),
    (
      v_empresa_id,
      'Perla',
      '0982371643',
      NULL,
      'perla'
    ),
    (
      v_empresa_id,
      'Perla Armoa',
      '0981343184',
      NULL,
      'perla armoa'
    ),
    (
      v_empresa_id,
      'Perla Gomez',
      '0982371643',
      NULL,
      'perla gomez'
    ),
    (
      v_empresa_id,
      'Perla Velazquez',
      '0993483164',
      NULL,
      'perla velazquez'
    ),
    (
      v_empresa_id,
      'Petra Martinez',
      '0982623789',
      NULL,
      'petra martinez'
    ),
    (
      v_empresa_id,
      'Phianina Amarilla',
      '0985915112',
      NULL,
      'phianina amarilla'
    ),
    (
      v_empresa_id,
      'Phil',
      '0992441537',
      NULL,
      'phil'
    ),
    (
      v_empresa_id,
      'Piarela Cabanas',
      '0992733708',
      NULL,
      'piarela cabanas'
    ),
    (
      v_empresa_id,
      'Pilar Alfonzo',
      '0986362922',
      NULL,
      'pilar alfonzo'
    ),
    (
      v_empresa_id,
      'Pilar Franco',
      '0972177622',
      NULL,
      'pilar franco'
    ),
    (
      v_empresa_id,
      'Pilar Frutos',
      '0981844918',
      '20MIL',
      'pilar frutos'
    ),
    (
      v_empresa_id,
      'Pina Lilian',
      '1130091183',
      NULL,
      'pina lilian'
    ),
    (
      v_empresa_id,
      'Pinha Lilian',
      '1130091183',
      NULL,
      'pinha lilian'
    ),
    (
      v_empresa_id,
      'Placida Gamarra',
      '0981922836',
      NULL,
      'placida gamarra'
    ),
    (
      v_empresa_id,
      'Pool Francois',
      '0971544422',
      NULL,
      'pool francois'
    ),
    (
      v_empresa_id,
      'Porfiria Rodriguez',
      '0982663700',
      NULL,
      'porfiria rodriguez'
    ),
    (
      v_empresa_id,
      'Pricila Gill',
      '0983578221',
      NULL,
      'pricila gill'
    ),
    (
      v_empresa_id,
      'Pricila Gonzalez',
      '0982978022',
      NULL,
      'pricila gonzalez'
    ),
    (
      v_empresa_id,
      'Pricila Goznalez',
      '0982978022',
      NULL,
      'pricila goznalez'
    ),
    (
      v_empresa_id,
      'pricila Moreira',
      '0981677404',
      NULL,
      'pricila moreira'
    ),
    (
      v_empresa_id,
      'Pricila Sutton',
      '0981767550',
      NULL,
      'pricila sutton'
    ),
    (
      v_empresa_id,
      'prime bolsa Fatima premium',
      NULL,
      NULL,
      'prime bolsa fatima premium'
    ),
    (
      v_empresa_id,
      'Princes Quintana',
      '0981389394',
      NULL,
      'princes quintana'
    ),
    (
      v_empresa_id,
      'Priscila Moreira',
      '0981677404',
      NULL,
      'priscila moreira'
    ),
    (
      v_empresa_id,
      'Prisila Gill',
      '0983578221',
      '1 selo (1)',
      'prisila gill'
    ),
    (
      v_empresa_id,
      'Prisila Jara',
      '0981961384',
      NULL,
      'prisila jara'
    ),
    (
      v_empresa_id,
      'pulseras',
      NULL,
      NULL,
      'pulseras'
    ),
    (
      v_empresa_id,
      'Queila Solis Ferreira',
      '0985250066',
      NULL,
      'queila solis ferreira'
    ),
    (
      v_empresa_id,
      'Rafael Maidana',
      '0994255702',
      NULL,
      'rafael maidana'
    ),
    (
      v_empresa_id,
      'Rafael Ribeiro',
      NULL,
      NULL,
      'rafael ribeiro'
    ),
    (
      v_empresa_id,
      'Raisa Segovia',
      '0984571993',
      NULL,
      'raisa segovia'
    ),
    (
      v_empresa_id,
      'Raiza Moreira',
      '0994251896',
      NULL,
      'raiza moreira'
    ),
    (
      v_empresa_id,
      'Ramona Lugo',
      '0982383069',
      NULL,
      'ramona lugo'
    ),
    (
      v_empresa_id,
      'Ramonita Escurra',
      '0982490109',
      NULL,
      'ramonita escurra'
    ),
    (
      v_empresa_id,
      'Raquel Alcaraz',
      '0984720624',
      NULL,
      'raquel alcaraz'
    ),
    (
      v_empresa_id,
      'Raquel Barreta',
      '0981992075',
      NULL,
      'raquel barreta'
    ),
    (
      v_empresa_id,
      'Raquel Barreto',
      '0981992075',
      NULL,
      'raquel barreto'
    ),
    (
      v_empresa_id,
      'Raquel Caceres',
      '0981263368',
      NULL,
      'raquel caceres'
    ),
    (
      v_empresa_id,
      'Raquel Carreras',
      '0981663904',
      NULL,
      'raquel carreras'
    ),
    (
      v_empresa_id,
      'Raquel Cuella',
      '0981480121',
      NULL,
      'raquel cuella'
    ),
    (
      v_empresa_id,
      'Raquel Dambi',
      '0991818681',
      NULL,
      'raquel dambi'
    ),
    (
      v_empresa_id,
      'Raquel Duarte',
      '0993319963',
      NULL,
      'raquel duarte'
    ),
    (
      v_empresa_id,
      'Raquel Gonzalez',
      '0982231079',
      '10mil',
      'raquel gonzalez'
    ),
    (
      v_empresa_id,
      'Raquel Ozuna',
      '0982493081',
      NULL,
      'raquel ozuna'
    ),
    (
      v_empresa_id,
      'Raquel Panizo',
      '0985402092',
      NULL,
      'raquel panizo'
    ),
    (
      v_empresa_id,
      'Raquel Recalde',
      '0981208221',
      NULL,
      'raquel recalde'
    ),
    (
      v_empresa_id,
      'Raquel Rey Ferreira',
      '0984664719',
      NULL,
      'raquel rey ferreira'
    ),
    (
      v_empresa_id,
      'Raquel Sosa',
      '0994187579',
      NULL,
      'raquel sosa'
    ),
    (
      v_empresa_id,
      'Raquel Vera',
      '0974990508',
      '10mil',
      'raquel vera'
    ),
    (
      v_empresa_id,
      'Raquel Villalba',
      '0985740311',
      NULL,
      'raquel villalba'
    ),
    (
      v_empresa_id,
      'Raquelina Carrillo',
      '0985869882',
      '30mil',
      'raquelina carrillo'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 10: filas 4501..5000
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Raul Cabrita',
      '0985666702',
      NULL,
      'raul cabrita'
    ),
    (
      v_empresa_id,
      'Raul Caceres',
      '0986122052',
      NULL,
      'raul caceres'
    ),
    (
      v_empresa_id,
      'Raul Pauline',
      '0971921830',
      NULL,
      'raul pauline'
    ),
    (
      v_empresa_id,
      'Rebe Benitez',
      '0975388789',
      NULL,
      'rebe benitez'
    ),
    (
      v_empresa_id,
      'Rebeca',
      NULL,
      NULL,
      'rebeca'
    ),
    (
      v_empresa_id,
      'Rebeca Abadie',
      '0984567762',
      NULL,
      'rebeca abadie'
    ),
    (
      v_empresa_id,
      'Rebeca Aguilar',
      '0983452340',
      NULL,
      'rebeca aguilar'
    ),
    (
      v_empresa_id,
      'Rebeca Ale',
      '0991199735',
      NULL,
      'rebeca ale'
    ),
    (
      v_empresa_id,
      'Rebeca Alvarez',
      '0982706943',
      NULL,
      'rebeca alvarez'
    ),
    (
      v_empresa_id,
      'Rebeca Azurra',
      '0986639940',
      NULL,
      'rebeca azurra'
    ),
    (
      v_empresa_id,
      'Rebeca Bazan',
      '0981229130',
      NULL,
      'rebeca bazan'
    ),
    (
      v_empresa_id,
      'Rebeca Benitez',
      '0981137410',
      NULL,
      'rebeca benitez'
    ),
    (
      v_empresa_id,
      'Rebeca Cabrera',
      '0982874446',
      NULL,
      'rebeca cabrera'
    ),
    (
      v_empresa_id,
      'Rebeca Campuzano',
      '0985989526',
      NULL,
      'rebeca campuzano'
    ),
    (
      v_empresa_id,
      'Rebeca Cubilla',
      '0983394371',
      '10MIL',
      'rebeca cubilla'
    ),
    (
      v_empresa_id,
      'Rebeca Diaz',
      '0982707573',
      NULL,
      'rebeca diaz'
    ),
    (
      v_empresa_id,
      'Rebeca Frutos',
      '0982588177',
      '60mil',
      'rebeca frutos'
    ),
    (
      v_empresa_id,
      'Rebeca Gonzalez',
      '0982795113',
      '30mil',
      'rebeca gonzalez'
    ),
    (
      v_empresa_id,
      'Rebeca Kelnner',
      '0981430227',
      NULL,
      'rebeca kelnner'
    ),
    (
      v_empresa_id,
      'Rebeca Ramirez',
      '0981114424',
      NULL,
      'rebeca ramirez'
    ),
    (
      v_empresa_id,
      'Rebeca Recalde',
      '0981880728',
      NULL,
      'rebeca recalde'
    ),
    (
      v_empresa_id,
      'Rebeca Villalba',
      '0994225422',
      NULL,
      'rebeca villalba'
    ),
    (
      v_empresa_id,
      'Rebecca Miranda',
      '0984872941',
      NULL,
      'rebecca miranda'
    ),
    (
      v_empresa_id,
      'Regina Acuna',
      '0992359535',
      NULL,
      'regina acuna'
    ),
    (
      v_empresa_id,
      'Regina Castillo',
      '0976120804',
      '10mil',
      'regina castillo'
    ),
    (
      v_empresa_id,
      'Regina Ortigoza',
      '0994393260',
      NULL,
      'regina ortigoza'
    ),
    (
      v_empresa_id,
      'Regina Pereira',
      '0985377011',
      NULL,
      'regina pereira'
    ),
    (
      v_empresa_id,
      'Reinaldo Ferreira',
      '0985104400',
      NULL,
      'reinaldo ferreira'
    ),
    (
      v_empresa_id,
      'Renata Rojas',
      '0981906303',
      NULL,
      'renata rojas'
    ),
    (
      v_empresa_id,
      'Renata Rojas Vega',
      '0984199123',
      NULL,
      'renata rojas vega'
    ),
    (
      v_empresa_id,
      'Renata Zarza',
      '0971621712',
      NULL,
      'renata zarza'
    ),
    (
      v_empresa_id,
      'Renato Segovia',
      '0972385006',
      NULL,
      'renato segovia'
    ),
    (
      v_empresa_id,
      'Riana Amarista',
      '0983425922',
      '10mil',
      'riana amarista'
    ),
    (
      v_empresa_id,
      'Ricard Medina',
      '0987337062',
      NULL,
      'ricard medina'
    ),
    (
      v_empresa_id,
      'Ricardo Albosno',
      '0972469422',
      NULL,
      'ricardo albosno'
    ),
    (
      v_empresa_id,
      'Ricardo Kiko',
      '0985281319',
      NULL,
      'ricardo kiko'
    ),
    (
      v_empresa_id,
      'Ricardo Morel',
      '0983379851',
      NULL,
      'ricardo morel'
    ),
    (
      v_empresa_id,
      'Ricardo Morinigo',
      '0982970444',
      NULL,
      'ricardo morinigo'
    ),
    (
      v_empresa_id,
      'Richard Amarilla',
      NULL,
      NULL,
      'richard amarilla'
    ),
    (
      v_empresa_id,
      'Richard Gauto',
      '0972688300',
      NULL,
      'richard gauto'
    ),
    (
      v_empresa_id,
      'Richard Martinez',
      '0986174937',
      '10mil',
      'richard martinez'
    ),
    (
      v_empresa_id,
      'Richard Nunez',
      '0983398642',
      NULL,
      'richard nunez'
    ),
    (
      v_empresa_id,
      'Richard Sosa',
      '0994767666',
      NULL,
      'richard sosa'
    ),
    (
      v_empresa_id,
      'Rilsi Bareiro',
      '0981462682',
      NULL,
      'rilsi bareiro'
    ),
    (
      v_empresa_id,
      'Rita Jara',
      '0981501688',
      NULL,
      'rita jara'
    ),
    (
      v_empresa_id,
      'Rita Leite',
      '0981873903',
      NULL,
      'rita leite'
    ),
    (
      v_empresa_id,
      'Rita Santos',
      NULL,
      '30MIL',
      'rita santos'
    ),
    (
      v_empresa_id,
      'Robbie Reyes Quintana',
      '0994282397',
      '30mil',
      'robbie reyes quintana'
    ),
    (
      v_empresa_id,
      'Robert',
      '0976401963',
      NULL,
      'robert'
    ),
    (
      v_empresa_id,
      'Robert Ramirez',
      '0991471179',
      NULL,
      'robert ramirez'
    ),
    (
      v_empresa_id,
      'Roberth Rodriguez',
      '0985911139',
      NULL,
      'roberth rodriguez'
    ),
    (
      v_empresa_id,
      'Roberto Bogado',
      '0985452632',
      NULL,
      'roberto bogado'
    ),
    (
      v_empresa_id,
      'Roberto Casco',
      '0981294318',
      NULL,
      'roberto casco'
    ),
    (
      v_empresa_id,
      'Roberto Vaquez',
      '0987389371',
      NULL,
      'roberto vaquez'
    ),
    (
      v_empresa_id,
      'Rocio Acosta',
      '0981148333',
      '20 mil',
      'rocio acosta'
    ),
    (
      v_empresa_id,
      'Rocio Amarilla',
      '0985497375',
      NULL,
      'rocio amarilla'
    ),
    (
      v_empresa_id,
      'Rocio Anazco',
      '0984925000',
      NULL,
      'rocio anazco'
    ),
    (
      v_empresa_id,
      'Rocio Baez',
      '0983801291',
      NULL,
      'rocio baez'
    ),
    (
      v_empresa_id,
      'Rocio Belen Sanchez',
      '0975111885',
      NULL,
      'rocio belen sanchez'
    ),
    (
      v_empresa_id,
      'Rocio Benitez',
      '0985464783',
      '1 selo (2)',
      'rocio benitez'
    ),
    (
      v_empresa_id,
      'Rocio Caballero',
      '0981563230',
      NULL,
      'rocio caballero'
    ),
    (
      v_empresa_id,
      'Rocio Cabrera',
      '0984265855',
      '1 selo (1)',
      'rocio cabrera'
    ),
    (
      v_empresa_id,
      'Rocio Caceres',
      '0992218428',
      NULL,
      'rocio caceres'
    ),
    (
      v_empresa_id,
      'Rocio Chamorro',
      '0994636100',
      NULL,
      'rocio chamorro'
    ),
    (
      v_empresa_id,
      'Rocio Cordoba',
      '0986180191',
      '20MIL',
      'rocio cordoba'
    ),
    (
      v_empresa_id,
      'Rocio Cuebas',
      '0984569477',
      NULL,
      'rocio cuebas'
    ),
    (
      v_empresa_id,
      'Rocio Diaz',
      '0991386129',
      NULL,
      'rocio diaz'
    ),
    (
      v_empresa_id,
      'Rocio Encina',
      '0983709586',
      NULL,
      'rocio encina'
    ),
    (
      v_empresa_id,
      'Rocio Estigarribia',
      '0984795999',
      NULL,
      'rocio estigarribia'
    ),
    (
      v_empresa_id,
      'Rocio Florentin',
      '0983699561',
      NULL,
      'rocio florentin'
    ),
    (
      v_empresa_id,
      'Rocio Fonseca',
      '0971324108',
      NULL,
      'rocio fonseca'
    ),
    (
      v_empresa_id,
      'Rocio Gimenez',
      '0984822064',
      '10MIL',
      'rocio gimenez'
    ),
    (
      v_empresa_id,
      'Rocio Gonzalez',
      '0992675236',
      '30MIL',
      'rocio gonzalez'
    ),
    (
      v_empresa_id,
      'Rocio Liliana Velazquez',
      '0992402033',
      NULL,
      'rocio liliana velazquez'
    ),
    (
      v_empresa_id,
      'Rocio Maciel',
      '0994500225',
      '10mil',
      'rocio maciel'
    ),
    (
      v_empresa_id,
      'Rocio Mariniego',
      '0981558160',
      NULL,
      'rocio mariniego'
    ),
    (
      v_empresa_id,
      'Rocio Martinez',
      '0981785793',
      NULL,
      'rocio martinez'
    ),
    (
      v_empresa_id,
      'Rocio Mendez',
      '0971646100',
      NULL,
      'rocio mendez'
    ),
    (
      v_empresa_id,
      'Rocio Mendoza',
      '0982966325',
      '10MIL',
      'rocio mendoza'
    ),
    (
      v_empresa_id,
      'Rocio Ojeda',
      '0971318876',
      NULL,
      'rocio ojeda'
    ),
    (
      v_empresa_id,
      'Rocio Ortellado',
      '0994756762',
      NULL,
      'rocio ortellado'
    ),
    (
      v_empresa_id,
      'Rocio Orue',
      '0985268002',
      NULL,
      'rocio orue'
    ),
    (
      v_empresa_id,
      'Rocio Ozuna',
      '0985296610',
      NULL,
      'rocio ozuna'
    ),
    (
      v_empresa_id,
      'Rocio Sacherarid',
      '0975779105',
      NULL,
      'rocio sacherarid'
    ),
    (
      v_empresa_id,
      'Rocio Santacruz',
      '0982291009',
      NULL,
      'rocio santacruz'
    ),
    (
      v_empresa_id,
      'Rodolfo Mamani',
      '0974843990',
      NULL,
      'rodolfo mamani'
    ),
    (
      v_empresa_id,
      'Rodrigo Aguero',
      '0982996245',
      NULL,
      'rodrigo aguero'
    ),
    (
      v_empresa_id,
      'Rodrigo Ariel Arce',
      '0994234314',
      NULL,
      'rodrigo ariel arce'
    ),
    (
      v_empresa_id,
      'Rodrigo Cano',
      '0991781412',
      NULL,
      'rodrigo cano'
    ),
    (
      v_empresa_id,
      'Rodrigo Cruz',
      '0971817392',
      NULL,
      'rodrigo cruz'
    ),
    (
      v_empresa_id,
      'Rodrigo Ibarra',
      '0983365897',
      NULL,
      'rodrigo ibarra'
    ),
    (
      v_empresa_id,
      'Rodrigo Lopez',
      '0981425970',
      NULL,
      'rodrigo lopez'
    ),
    (
      v_empresa_id,
      'Rodrigo Rivarola',
      '0986635172',
      '1 selo (2)',
      'rodrigo rivarola'
    ),
    (
      v_empresa_id,
      'Rodrigo Teixido',
      '0981950014',
      NULL,
      'rodrigo teixido'
    ),
    (
      v_empresa_id,
      'Rodrigo Villalba',
      '0984738671',
      NULL,
      'rodrigo villalba'
    ),
    (
      v_empresa_id,
      'Rodrigp Barbosa',
      '0991531347',
      NULL,
      'rodrigp barbosa'
    ),
    (
      v_empresa_id,
      'Rodrrigo Pecci',
      '0971308612',
      NULL,
      'rodrrigo pecci'
    ),
    (
      v_empresa_id,
      'Roger Gonzalez',
      '0982547133',
      NULL,
      'roger gonzalez'
    ),
    (
      v_empresa_id,
      'Rolando Arguello',
      '0975172203',
      NULL,
      'rolando arguello'
    ),
    (
      v_empresa_id,
      'Rolando Gomez',
      '0994820663',
      NULL,
      'rolando gomez'
    ),
    (
      v_empresa_id,
      'Rolendia Sladivar',
      '0981641461',
      NULL,
      'rolendia sladivar'
    ),
    (
      v_empresa_id,
      'Romina Acosta',
      '0991624306',
      '30MIL',
      'romina acosta'
    ),
    (
      v_empresa_id,
      'Romina alvarenga',
      '0982430898',
      NULL,
      'romina alvarenga'
    ),
    (
      v_empresa_id,
      'Romina Benitez',
      '0981144753',
      NULL,
      'romina benitez'
    ),
    (
      v_empresa_id,
      'Romina Cabrera',
      '0986175162',
      NULL,
      'romina cabrera'
    ),
    (
      v_empresa_id,
      'Romina Cardozo',
      '0982915286',
      NULL,
      'romina cardozo'
    ),
    (
      v_empresa_id,
      'Romina Carransa',
      '0991914220',
      NULL,
      'romina carransa'
    ),
    (
      v_empresa_id,
      'Romina Chamorro',
      '0982840298',
      NULL,
      'romina chamorro'
    ),
    (
      v_empresa_id,
      'Romina Colman',
      '0986341948',
      NULL,
      'romina colman'
    ),
    (
      v_empresa_id,
      'Romina Cords',
      '0983911736',
      NULL,
      'romina cords'
    ),
    (
      v_empresa_id,
      'Romina Duarte',
      '0992927423',
      NULL,
      'romina duarte'
    ),
    (
      v_empresa_id,
      'Romina Dure',
      '0974475636',
      NULL,
      'romina dure'
    ),
    (
      v_empresa_id,
      'Romina Enarbaez',
      '0991997395',
      NULL,
      'romina enarbaez'
    ),
    (
      v_empresa_id,
      'Romina Farias',
      '0984966764',
      '30mil',
      'romina farias'
    ),
    (
      v_empresa_id,
      'Romina Garay Sanabria',
      '0984506569',
      NULL,
      'romina garay sanabria'
    ),
    (
      v_empresa_id,
      'Romina Gimenez',
      '0991815689',
      NULL,
      'romina gimenez'
    ),
    (
      v_empresa_id,
      'Romina Gomez',
      '0983376281',
      NULL,
      'romina gomez'
    ),
    (
      v_empresa_id,
      'Romina Gonzalez',
      '0983476568',
      NULL,
      'romina gonzalez'
    ),
    (
      v_empresa_id,
      'Romina Guerrero',
      '0981483385',
      '1 selo (3)',
      'romina guerrero'
    ),
    (
      v_empresa_id,
      'Romina Labiste',
      '0983579680',
      NULL,
      'romina labiste'
    ),
    (
      v_empresa_id,
      'Romina Leguizamon',
      '98233061',
      NULL,
      'romina leguizamon'
    ),
    (
      v_empresa_id,
      'Romina Martinez',
      '0981926319',
      NULL,
      'romina martinez'
    ),
    (
      v_empresa_id,
      'Romina Morinigo',
      '0981251378',
      NULL,
      'romina morinigo'
    ),
    (
      v_empresa_id,
      'Romina Munez',
      '0971391661',
      '10MIL',
      'romina munez'
    ),
    (
      v_empresa_id,
      'Romina Quevedo',
      '0972114684',
      NULL,
      'romina quevedo'
    ),
    (
      v_empresa_id,
      'Romina Ramirez Santos',
      '0971126216',
      NULL,
      'romina ramirez santos'
    ),
    (
      v_empresa_id,
      'Romina Ricardi',
      '0986617977',
      NULL,
      'romina ricardi'
    ),
    (
      v_empresa_id,
      'Romina Rios',
      '0981970589',
      NULL,
      'romina rios'
    ),
    (
      v_empresa_id,
      'Romina Robledo',
      '0971211600',
      '1 selo (1)',
      'romina robledo'
    ),
    (
      v_empresa_id,
      'Romina Ruguera',
      '0981140072',
      NULL,
      'romina ruguera'
    ),
    (
      v_empresa_id,
      'Romina Vera',
      '0971913470',
      NULL,
      'romina vera'
    ),
    (
      v_empresa_id,
      'Romina Vonglasenapp',
      '0982899666',
      NULL,
      'romina vonglasenapp'
    ),
    (
      v_empresa_id,
      'Romina Yahari',
      '0972202422',
      NULL,
      'romina yahari'
    ),
    (
      v_empresa_id,
      'Romyna Benitez',
      '0986180008',
      NULL,
      'romyna benitez'
    ),
    (
      v_empresa_id,
      'Ronald Hildebrant',
      NULL,
      NULL,
      'ronald hildebrant'
    ),
    (
      v_empresa_id,
      'Ronald Mattesich',
      '0974574820',
      NULL,
      'ronald mattesich'
    ),
    (
      v_empresa_id,
      'Ronaldo Vaques',
      '0991472738',
      NULL,
      'ronaldo vaques'
    ),
    (
      v_empresa_id,
      'Roque Sanchez',
      '0994727191',
      NULL,
      'roque sanchez'
    ),
    (
      v_empresa_id,
      'Rosa Aconta',
      '0987150344',
      NULL,
      'rosa aconta'
    ),
    (
      v_empresa_id,
      'Rosa Alegre',
      '0994505087',
      NULL,
      'rosa alegre'
    ),
    (
      v_empresa_id,
      'Rosa Alonso',
      '0981304568',
      NULL,
      'rosa alonso'
    ),
    (
      v_empresa_id,
      'Rosa Armoa',
      '0972940431',
      NULL,
      'rosa armoa'
    ),
    (
      v_empresa_id,
      'Rosa Barrios',
      '0994305882',
      '10mil',
      'rosa barrios'
    ),
    (
      v_empresa_id,
      'Rosa Caballero',
      '0986960218',
      NULL,
      'rosa caballero'
    ),
    (
      v_empresa_id,
      'Rosa Diaz',
      '0992378660',
      NULL,
      'rosa diaz'
    ),
    (
      v_empresa_id,
      'Rosa Galeano',
      '0984784876',
      NULL,
      'rosa galeano'
    ),
    (
      v_empresa_id,
      'Rosa Gonzalez',
      '0975199342',
      NULL,
      'rosa gonzalez'
    ),
    (
      v_empresa_id,
      'Rosa Martinez',
      '0994317130',
      NULL,
      'rosa martinez'
    ),
    (
      v_empresa_id,
      'Rosa Mendoza',
      '0991703080',
      NULL,
      'rosa mendoza'
    ),
    (
      v_empresa_id,
      'Rosa Montenegro',
      '0983655867',
      NULL,
      'rosa montenegro'
    ),
    (
      v_empresa_id,
      'Rosa Morel',
      '0981127994',
      NULL,
      'rosa morel'
    ),
    (
      v_empresa_id,
      'Rosa Ojeda',
      '0981151017',
      NULL,
      'rosa ojeda'
    ),
    (
      v_empresa_id,
      'Rosa Ortiz',
      '0961618891',
      NULL,
      'rosa ortiz'
    ),
    (
      v_empresa_id,
      'Rosa Ortriz',
      '0961618891',
      NULL,
      'rosa ortriz'
    ),
    (
      v_empresa_id,
      'Rosa Taboada',
      '0962151476',
      NULL,
      'rosa taboada'
    ),
    (
      v_empresa_id,
      'Rosa Torres',
      '0983561205',
      NULL,
      'rosa torres'
    ),
    (
      v_empresa_id,
      'Rosa Zarate',
      '0983268322',
      NULL,
      'rosa zarate'
    ),
    (
      v_empresa_id,
      'Rosalba Iberbuben',
      '0982168395',
      NULL,
      'rosalba iberbuben'
    ),
    (
      v_empresa_id,
      'Rosalia Cubilla',
      '0981536997',
      '60MIL',
      'rosalia cubilla'
    ),
    (
      v_empresa_id,
      'Rosalia Firifuero',
      '0991689651',
      NULL,
      'rosalia firifuero'
    ),
    (
      v_empresa_id,
      'Rosalia Leguizamon',
      '0981520047',
      NULL,
      'rosalia leguizamon'
    ),
    (
      v_empresa_id,
      'Rosalin Barrios',
      '0981164945',
      NULL,
      'rosalin barrios'
    ),
    (
      v_empresa_id,
      'Rosana',
      NULL,
      NULL,
      'rosana'
    ),
    (
      v_empresa_id,
      'Rosana Achucarro',
      '0971952808',
      NULL,
      'rosana achucarro'
    ),
    (
      v_empresa_id,
      'Rosana Benitez',
      '0986741713',
      NULL,
      'rosana benitez'
    ),
    (
      v_empresa_id,
      'Rosana Britez',
      '0981449003',
      NULL,
      'rosana britez'
    ),
    (
      v_empresa_id,
      'Rosana Cardozo',
      '0972182034',
      NULL,
      'rosana cardozo'
    ),
    (
      v_empresa_id,
      'Rosana Duarte',
      '0991948396',
      NULL,
      'rosana duarte'
    ),
    (
      v_empresa_id,
      'Rosana Eliceche',
      '0972218935',
      NULL,
      'rosana eliceche'
    ),
    (
      v_empresa_id,
      'Rosana Fleitas',
      '0991711443',
      '20mil',
      'rosana fleitas'
    ),
    (
      v_empresa_id,
      'Rosana Garai',
      '0991404053',
      NULL,
      'rosana garai'
    ),
    (
      v_empresa_id,
      'Rosana Gimenez',
      '0971899643',
      NULL,
      'rosana gimenez'
    ),
    (
      v_empresa_id,
      'Rosana Insfran',
      '0981119590',
      NULL,
      'rosana insfran'
    ),
    (
      v_empresa_id,
      'Rosana Lopez',
      '0984665539',
      NULL,
      'rosana lopez'
    ),
    (
      v_empresa_id,
      'Rosana Mantiel',
      '0981309279',
      NULL,
      'rosana mantiel'
    ),
    (
      v_empresa_id,
      'Rosana Santacruz',
      '0984584881',
      NULL,
      'rosana santacruz'
    ),
    (
      v_empresa_id,
      'Rosana Snachez',
      '0982131876',
      NULL,
      'rosana snachez'
    ),
    (
      v_empresa_id,
      'Rosana Vera',
      '0971506859',
      '1 selo (1)',
      'rosana vera'
    ),
    (
      v_empresa_id,
      'Rosangela Silveira',
      '0981986166',
      NULL,
      'rosangela silveira'
    ),
    (
      v_empresa_id,
      'Rosanna Rodas',
      '0985241414',
      NULL,
      'rosanna rodas'
    ),
    (
      v_empresa_id,
      'Rosario Brisela',
      '0981870145',
      NULL,
      'rosario brisela'
    ),
    (
      v_empresa_id,
      'Rosario Brizuela',
      '0981870145',
      NULL,
      'rosario brizuela'
    ),
    (
      v_empresa_id,
      'Rosario Gonzalez',
      '0982130097',
      NULL,
      'rosario gonzalez'
    ),
    (
      v_empresa_id,
      'Rosaura Espinoza',
      '0992584471',
      '10mil',
      'rosaura espinoza'
    ),
    (
      v_empresa_id,
      'Rosaura Portillo',
      '0981495014',
      NULL,
      'rosaura portillo'
    ),
    (
      v_empresa_id,
      'Roselina Figueredo',
      '0991865994',
      NULL,
      'roselina figueredo'
    ),
    (
      v_empresa_id,
      'Rosi Diaz',
      '0983304204',
      NULL,
      'rosi diaz'
    ),
    (
      v_empresa_id,
      'Rosie Neufeld',
      '0971436724',
      '10MIL',
      'rosie neufeld'
    ),
    (
      v_empresa_id,
      'Rosmarie Nunes',
      '0971445646',
      NULL,
      'rosmarie nunes'
    ),
    (
      v_empresa_id,
      'Rosmary Armoa',
      '0994760673',
      '20mil',
      'rosmary armoa'
    ),
    (
      v_empresa_id,
      'Rosmary Nunez',
      '0971445646',
      NULL,
      'rosmary nunez'
    ),
    (
      v_empresa_id,
      'Rosmary Suhsner',
      '0982527475',
      NULL,
      'rosmary suhsner'
    ),
    (
      v_empresa_id,
      'Rosmery Argana',
      '0983518226',
      '1 selo (7)',
      'rosmery argana'
    ),
    (
      v_empresa_id,
      'Rossa De la gracia',
      '0994148479',
      NULL,
      'rossa de la gracia'
    ),
    (
      v_empresa_id,
      'Rossana Almada',
      '0985929807',
      NULL,
      'rossana almada'
    ),
    (
      v_empresa_id,
      'Rossana Amarilla',
      '0985262614',
      NULL,
      'rossana amarilla'
    ),
    (
      v_empresa_id,
      'Rossana Caceres',
      '0971546160',
      NULL,
      'rossana caceres'
    ),
    (
      v_empresa_id,
      'Rossana Chavez',
      '0972828262',
      NULL,
      'rossana chavez'
    ),
    (
      v_empresa_id,
      'Rossana Della Llogia',
      '0984777493',
      NULL,
      'rossana della llogia'
    ),
    (
      v_empresa_id,
      'Rossana Lopez',
      '0984665539',
      '20MIL',
      'rossana lopez'
    ),
    (
      v_empresa_id,
      'Rossana Ozuna',
      '0984737813',
      NULL,
      'rossana ozuna'
    ),
    (
      v_empresa_id,
      'Rossana Salinas',
      '0981541311',
      NULL,
      'rossana salinas'
    ),
    (
      v_empresa_id,
      'Rossana Sanchez',
      '0981132117',
      NULL,
      'rossana sanchez'
    ),
    (
      v_empresa_id,
      'Rossanna Insfran',
      '0981119590',
      '10mil',
      'rossanna insfran'
    ),
    (
      v_empresa_id,
      'Roswitha Schizc',
      '0981792340',
      NULL,
      'roswitha schizc'
    ),
    (
      v_empresa_id,
      'Rosy Duarte',
      '0982333747',
      NULL,
      'rosy duarte'
    ),
    (
      v_empresa_id,
      'Roxana Avila',
      '0981978509',
      NULL,
      'roxana avila'
    ),
    (
      v_empresa_id,
      'Roxana Bernal',
      '0991734343',
      NULL,
      'roxana bernal'
    ),
    (
      v_empresa_id,
      'Roxana Bolnano',
      '3624383888',
      NULL,
      'roxana bolnano'
    ),
    (
      v_empresa_id,
      'Roxana Duarte',
      '0984223017',
      NULL,
      'roxana duarte'
    ),
    (
      v_empresa_id,
      'Roxana Gimenez',
      '0991372897',
      NULL,
      'roxana gimenez'
    ),
    (
      v_empresa_id,
      'Roxana Ruiz Diaz',
      '0986550668',
      NULL,
      'roxana ruiz diaz'
    ),
    (
      v_empresa_id,
      'Rrenato Savio',
      '0971578980',
      NULL,
      'rrenato savio'
    ),
    (
      v_empresa_id,
      'Ruben Avila',
      '0994651420',
      NULL,
      'ruben avila'
    ),
    (
      v_empresa_id,
      'Ruben Brizuena Gonzalez',
      '0985924865',
      NULL,
      'ruben brizuena gonzalez'
    ),
    (
      v_empresa_id,
      'Ruben Chaparro',
      '0992219900',
      NULL,
      'ruben chaparro'
    ),
    (
      v_empresa_id,
      'Ruben Jara',
      '0983455747',
      NULL,
      'ruben jara'
    ),
    (
      v_empresa_id,
      'Ruben Ramirez',
      '0972955034',
      '10MIL',
      'ruben ramirez'
    ),
    (
      v_empresa_id,
      'Ruben Ramos',
      '0985998468',
      NULL,
      'ruben ramos'
    ),
    (
      v_empresa_id,
      'Ruben Ruiz Diaz',
      '0992687043',
      NULL,
      'ruben ruiz diaz'
    ),
    (
      v_empresa_id,
      'Rufina Maciel',
      '0982335893',
      NULL,
      'rufina maciel'
    ),
    (
      v_empresa_id,
      'Ruh Quintana',
      '0982327571',
      NULL,
      'ruh quintana'
    ),
    (
      v_empresa_id,
      'Rumilda',
      '0971109102',
      NULL,
      'rumilda'
    ),
    (
      v_empresa_id,
      'Rut Portillo',
      '0981663617',
      NULL,
      'rut portillo'
    ),
    (
      v_empresa_id,
      'Rut Recalde',
      '0961672120',
      NULL,
      'rut recalde'
    ),
    (
      v_empresa_id,
      'Ruth Alcedes',
      '0981213601',
      NULL,
      'ruth alcedes'
    ),
    (
      v_empresa_id,
      'Ruth Ayala',
      '0984737594',
      '1 selo (1)',
      'ruth ayala'
    ),
    (
      v_empresa_id,
      'Ruth Castilllo',
      '0982692377',
      NULL,
      'ruth castilllo'
    ),
    (
      v_empresa_id,
      'Ruth Coronel',
      '0994143661',
      NULL,
      'ruth coronel'
    ),
    (
      v_empresa_id,
      'Ruth Delgado',
      '0994883600',
      NULL,
      'ruth delgado'
    ),
    (
      v_empresa_id,
      'Ruth Duarte',
      '0971769070',
      NULL,
      'ruth duarte'
    ),
    (
      v_empresa_id,
      'Ruth Eger',
      NULL,
      NULL,
      'ruth eger'
    ),
    (
      v_empresa_id,
      'Ruth Farina',
      '0982669697',
      '1 selo (2)',
      'ruth farina'
    ),
    (
      v_empresa_id,
      'Ruth Ferreira',
      '0971976078',
      NULL,
      'ruth ferreira'
    ),
    (
      v_empresa_id,
      'Ruth Gonzalez',
      '0961608708',
      NULL,
      'ruth gonzalez'
    ),
    (
      v_empresa_id,
      'Ruth Ibarrola',
      '0975636522',
      '1 selo (7)',
      'ruth ibarrola'
    ),
    (
      v_empresa_id,
      'Ruth Leiva',
      '0986736702',
      NULL,
      'ruth leiva'
    ),
    (
      v_empresa_id,
      'Ruth Menialgo',
      '9934220036',
      NULL,
      'ruth menialgo'
    ),
    (
      v_empresa_id,
      'Ruth Mongelos',
      '0981196844',
      NULL,
      'ruth mongelos'
    ),
    (
      v_empresa_id,
      'Ruth Nunez',
      '0985826346',
      NULL,
      'ruth nunez'
    ),
    (
      v_empresa_id,
      'Ruth Paredes',
      '0992546975',
      '10MIL',
      'ruth paredes'
    ),
    (
      v_empresa_id,
      'Ruth Pereira',
      '0976940244',
      NULL,
      'ruth pereira'
    ),
    (
      v_empresa_id,
      'Ruth Perez',
      '0981289174',
      NULL,
      'ruth perez'
    ),
    (
      v_empresa_id,
      'Ruth Prieto',
      '0991730893',
      '50mil',
      'ruth prieto'
    ),
    (
      v_empresa_id,
      'Ruth Ramirez',
      '0986328718',
      NULL,
      'ruth ramirez'
    ),
    (
      v_empresa_id,
      'Ruth Roa',
      '0983311255',
      NULL,
      'ruth roa'
    ),
    (
      v_empresa_id,
      'Ruth Rojas',
      '0976964884',
      NULL,
      'ruth rojas'
    ),
    (
      v_empresa_id,
      'Ruth Santander',
      '0995655621',
      NULL,
      'ruth santander'
    ),
    (
      v_empresa_id,
      'Ruth Sosa',
      '0994349139',
      NULL,
      'ruth sosa'
    ),
    (
      v_empresa_id,
      'Ruth Stollmair',
      '0971143843',
      NULL,
      'ruth stollmair'
    ),
    (
      v_empresa_id,
      'Ruth Valiente',
      '0991908080',
      NULL,
      'ruth valiente'
    ),
    (
      v_empresa_id,
      'Ruth Vazquez',
      '0991845441',
      NULL,
      'ruth vazquez'
    ),
    (
      v_empresa_id,
      'Ruth Velazquez',
      '0981772849',
      NULL,
      'ruth velazquez'
    ),
    (
      v_empresa_id,
      'Ruth Venialgo',
      '0981212551',
      NULL,
      'ruth venialgo'
    ),
    (
      v_empresa_id,
      'Ruth Venialvo',
      '0993422036',
      NULL,
      'ruth venialvo'
    ),
    (
      v_empresa_id,
      'Sabrina Adam',
      '0984752074',
      NULL,
      'sabrina adam'
    ),
    (
      v_empresa_id,
      'Sabrina Avas',
      '0983856051',
      NULL,
      'sabrina avas'
    ),
    (
      v_empresa_id,
      'Sabrina Catillo',
      '0994785385',
      NULL,
      'sabrina catillo'
    ),
    (
      v_empresa_id,
      'Sabrina Chamorro',
      '0991350273',
      NULL,
      'sabrina chamorro'
    ),
    (
      v_empresa_id,
      'Sabrina Ovelar',
      '0982349666',
      NULL,
      'sabrina ovelar'
    ),
    (
      v_empresa_id,
      'Sabrina Sanchez',
      '0981448305',
      NULL,
      'sabrina sanchez'
    ),
    (
      v_empresa_id,
      'Sabrina Serrati',
      '0981208999',
      NULL,
      'sabrina serrati'
    ),
    (
      v_empresa_id,
      'Sabrina Velazquez',
      '0984773238',
      '10MIL',
      'sabrina velazquez'
    ),
    (
      v_empresa_id,
      'Sadi Gomez',
      '0984992570',
      NULL,
      'sadi gomez'
    ),
    (
      v_empresa_id,
      'Sadi Salul',
      '0991729511',
      NULL,
      'sadi salul'
    ),
    (
      v_empresa_id,
      'Sady Dure',
      '0972853055',
      NULL,
      'sady dure'
    ),
    (
      v_empresa_id,
      'Sady Galeano',
      '0982643647',
      NULL,
      'sady galeano'
    ),
    (
      v_empresa_id,
      'Sady salum',
      '0991729511',
      NULL,
      'sady salum'
    ),
    (
      v_empresa_id,
      'Saharon Lopez',
      '0983946696',
      '20mil',
      'saharon lopez'
    ),
    (
      v_empresa_id,
      'Saida Gimenez',
      '0961330047',
      NULL,
      'saida gimenez'
    ),
    (
      v_empresa_id,
      'Saide Acosta',
      '0983379606',
      NULL,
      'saide acosta'
    ),
    (
      v_empresa_id,
      'Sair Coleman',
      '0981859958',
      NULL,
      'sair coleman'
    ),
    (
      v_empresa_id,
      'Sair Colman',
      '0981859958',
      NULL,
      'sair colman'
    ),
    (
      v_empresa_id,
      'Saira Ibarra',
      '0985299227',
      NULL,
      'saira ibarra'
    ),
    (
      v_empresa_id,
      'Saldo lentes arete',
      NULL,
      NULL,
      'saldo lentes arete'
    ),
    (
      v_empresa_id,
      'Salma Vega',
      '0987213575',
      NULL,
      'salma vega'
    ),
    (
      v_empresa_id,
      'Salma Vera',
      '0981267136',
      NULL,
      'salma vera'
    ),
    (
      v_empresa_id,
      'Salome Molinas',
      '0981144713',
      NULL,
      'salome molinas'
    ),
    (
      v_empresa_id,
      'Samanta Franco',
      '0971965020',
      '40mil',
      'samanta franco'
    ),
    (
      v_empresa_id,
      'Samanta Molinas',
      '0986925479',
      NULL,
      'samanta molinas'
    ),
    (
      v_empresa_id,
      'Samanta Vancleef',
      '0982470650',
      NULL,
      'samanta vancleef'
    ),
    (
      v_empresa_id,
      'Samantha Saldivar',
      '0983757979',
      NULL,
      'samantha saldivar'
    ),
    (
      v_empresa_id,
      'Samer Salinas',
      '0991813650',
      NULL,
      'samer salinas'
    ),
    (
      v_empresa_id,
      'Samira Aranda',
      '0973807752',
      NULL,
      'samira aranda'
    ),
    (
      v_empresa_id,
      'Samira Chavez',
      '0971543555',
      NULL,
      'samira chavez'
    ),
    (
      v_empresa_id,
      'Samira Gonzalez',
      '0986753297',
      '10mil',
      'samira gonzalez'
    ),
    (
      v_empresa_id,
      'Samira Meza',
      '0991448865',
      '10mil',
      'samira meza'
    ),
    (
      v_empresa_id,
      'Samira Perez',
      '0971562225',
      NULL,
      'samira perez'
    ),
    (
      v_empresa_id,
      'Samira Sanabria',
      '0984522301',
      NULL,
      'samira sanabria'
    ),
    (
      v_empresa_id,
      'Samira Simon',
      '0994467626',
      NULL,
      'samira simon'
    ),
    (
      v_empresa_id,
      'Samuel Mora',
      '0971726842',
      NULL,
      'samuel mora'
    ),
    (
      v_empresa_id,
      'Samuel Tilleria',
      '0985648177',
      NULL,
      'samuel tilleria'
    ),
    (
      v_empresa_id,
      'Sandi Britez',
      '0976990530',
      NULL,
      'sandi britez'
    ),
    (
      v_empresa_id,
      'Sandra',
      NULL,
      NULL,
      'sandra'
    ),
    (
      v_empresa_id,
      'Sandra Almada',
      '0971666319',
      NULL,
      'sandra almada'
    ),
    (
      v_empresa_id,
      'Sandra Benitez',
      '0984170683',
      '10mil',
      'sandra benitez'
    ),
    (
      v_empresa_id,
      'Sandra Benitrz',
      '0983357342',
      NULL,
      'sandra benitrz'
    ),
    (
      v_empresa_id,
      'Sandra Burgos',
      '0983874071',
      NULL,
      'sandra burgos'
    ),
    (
      v_empresa_id,
      'Sandra Cabrera',
      '0982196609',
      NULL,
      'sandra cabrera'
    ),
    (
      v_empresa_id,
      'Sandra Cardoso',
      '0971376076',
      NULL,
      'sandra cardoso'
    ),
    (
      v_empresa_id,
      'Sandra Cuebas',
      '0983161161',
      NULL,
      'sandra cuebas'
    ),
    (
      v_empresa_id,
      'Sandra Feliu',
      '0981363142',
      NULL,
      'sandra feliu'
    ),
    (
      v_empresa_id,
      'Sandra Garay',
      '0991193287',
      NULL,
      'sandra garay'
    ),
    (
      v_empresa_id,
      'Sandra Gimaras',
      '0981789598',
      '10mil',
      'sandra gimaras'
    ),
    (
      v_empresa_id,
      'Sandra Gonzalez',
      '0984162594',
      '1 selo (4)',
      'sandra gonzalez'
    ),
    (
      v_empresa_id,
      'Sandra Guimaraes',
      '0981789598',
      NULL,
      'sandra guimaraes'
    ),
    (
      v_empresa_id,
      'Sandra Laterra',
      '0971114400',
      NULL,
      'sandra laterra'
    ),
    (
      v_empresa_id,
      'Sandra Liuzzi',
      '0991220316',
      NULL,
      'sandra liuzzi'
    ),
    (
      v_empresa_id,
      'Sandra Longo',
      '0994949030',
      NULL,
      'sandra longo'
    ),
    (
      v_empresa_id,
      'Sandra Lugo',
      '0983468996',
      NULL,
      'sandra lugo'
    ),
    (
      v_empresa_id,
      'Sandra Mann',
      '0971850841',
      '1 selo (1)',
      'sandra mann'
    ),
    (
      v_empresa_id,
      'Sandra Martin',
      '0984898726',
      NULL,
      'sandra martin'
    ),
    (
      v_empresa_id,
      'Sandra Mirrano',
      '0981560892',
      NULL,
      'sandra mirrano'
    ),
    (
      v_empresa_id,
      'Sandra Navarro',
      '0982502294',
      '1 selo (4)',
      'sandra navarro'
    ),
    (
      v_empresa_id,
      'Sandra Noguera',
      '0982920452',
      '10mil',
      'sandra noguera'
    ),
    (
      v_empresa_id,
      'Sandra Ortiz',
      '0986899974',
      NULL,
      'sandra ortiz'
    ),
    (
      v_empresa_id,
      'Sandra Pagliar',
      '0984665912',
      NULL,
      'sandra pagliar'
    ),
    (
      v_empresa_id,
      'Sandra Portillo',
      '0972896954',
      '60MIL',
      'sandra portillo'
    ),
    (
      v_empresa_id,
      'Sandra Porto',
      '0974701503',
      NULL,
      'sandra porto'
    ),
    (
      v_empresa_id,
      'Sandra Ramos',
      '0981992717',
      '30mil',
      'sandra ramos'
    ),
    (
      v_empresa_id,
      'Sandra Saldivar',
      '0985977060',
      NULL,
      'sandra saldivar'
    ),
    (
      v_empresa_id,
      'Sandra Santacruz',
      '0972997577',
      '20mil',
      'sandra santacruz'
    ),
    (
      v_empresa_id,
      'Sandra Soler',
      '0981697058',
      NULL,
      'sandra soler'
    ),
    (
      v_empresa_id,
      'Sandra Sosa',
      '0981115225',
      NULL,
      'sandra sosa'
    ),
    (
      v_empresa_id,
      'Sandra Valdez',
      '0985873899',
      NULL,
      'sandra valdez'
    ),
    (
      v_empresa_id,
      'Sandra Valiente',
      '0981234294',
      NULL,
      'sandra valiente'
    ),
    (
      v_empresa_id,
      'Sandra Velazquez',
      '0983680029',
      '10mil',
      'sandra velazquez'
    ),
    (
      v_empresa_id,
      'Sandra Yagal',
      '0992727216',
      NULL,
      'sandra yagal'
    ),
    (
      v_empresa_id,
      'Sanie Ortiz',
      '0981347436',
      NULL,
      'sanie ortiz'
    ),
    (
      v_empresa_id,
      'Sannie Tellria',
      '0961988485',
      NULL,
      'sannie tellria'
    ),
    (
      v_empresa_id,
      'Sanny Barreto',
      '0985407512',
      NULL,
      'sanny barreto'
    ),
    (
      v_empresa_id,
      'Sanny Barrios',
      '0984500016',
      NULL,
      'sanny barrios'
    ),
    (
      v_empresa_id,
      'Sanny Palma',
      '0991584052',
      '1 selo (1)',
      'sanny palma'
    ),
    (
      v_empresa_id,
      'Sannybell Sachak',
      '0962321025',
      '10MIL',
      'sannybell sachak'
    ),
    (
      v_empresa_id,
      'Santiago',
      '0992310777',
      '10mil',
      'santiago'
    ),
    (
      v_empresa_id,
      'Santiago Espinola',
      '0981123293',
      NULL,
      'santiago espinola'
    ),
    (
      v_empresa_id,
      'Sara Aguero',
      '0985272100',
      NULL,
      'sara aguero'
    ),
    (
      v_empresa_id,
      'Sara Ale',
      '0982933625',
      NULL,
      'sara ale'
    ),
    (
      v_empresa_id,
      'Sara Almada',
      '0994286577',
      NULL,
      'sara almada'
    ),
    (
      v_empresa_id,
      'Sara Alvarez',
      '0983836678',
      '10MIL',
      'sara alvarez'
    ),
    (
      v_empresa_id,
      'Sara Baez',
      '0994459840',
      NULL,
      'sara baez'
    ),
    (
      v_empresa_id,
      'Sara Benitez',
      '0983421728',
      NULL,
      'sara benitez'
    ),
    (
      v_empresa_id,
      'Sara Canete',
      '0984515272',
      '1 selo (2)',
      'sara canete'
    ),
    (
      v_empresa_id,
      'Sara Casco',
      '0983169015',
      NULL,
      'sara casco'
    ),
    (
      v_empresa_id,
      'Sara Chaparro',
      '0981357718',
      NULL,
      'sara chaparro'
    ),
    (
      v_empresa_id,
      'Sara Coronel',
      '0983104293',
      '10MIL',
      'sara coronel'
    ),
    (
      v_empresa_id,
      'Sara Duici',
      '0982004111',
      NULL,
      'sara duici'
    ),
    (
      v_empresa_id,
      'Sara Fleitas',
      '0984402124',
      NULL,
      'sara fleitas'
    ),
    (
      v_empresa_id,
      'Sara Galiano',
      '0992245898',
      NULL,
      'sara galiano'
    ),
    (
      v_empresa_id,
      'Sara Goydy',
      '0981283938',
      NULL,
      'sara goydy'
    ),
    (
      v_empresa_id,
      'Sara Ledesma',
      '0984680607',
      NULL,
      'sara ledesma'
    ),
    (
      v_empresa_id,
      'Sara Martinez',
      '0981910247',
      NULL,
      'sara martinez'
    ),
    (
      v_empresa_id,
      'Sara Mendez',
      '0971590061',
      NULL,
      'sara mendez'
    ),
    (
      v_empresa_id,
      'Sara Mendoza',
      '0976954894',
      NULL,
      'sara mendoza'
    ),
    (
      v_empresa_id,
      'Sara Ortiz',
      '0983327188',
      NULL,
      'sara ortiz'
    ),
    (
      v_empresa_id,
      'Sara Peralta',
      '0984605787',
      NULL,
      'sara peralta'
    ),
    (
      v_empresa_id,
      'Sara Pereira',
      '0981433462',
      NULL,
      'sara pereira'
    ),
    (
      v_empresa_id,
      'Sara Perez',
      '0984587441',
      NULL,
      'sara perez'
    ),
    (
      v_empresa_id,
      'Sara Quintana',
      '0987122295',
      NULL,
      'sara quintana'
    ),
    (
      v_empresa_id,
      'Sara Riffarachi',
      '0982781036',
      NULL,
      'sara riffarachi'
    ),
    (
      v_empresa_id,
      'Sara Rodriguez',
      '0992293071',
      NULL,
      'sara rodriguez'
    ),
    (
      v_empresa_id,
      'Sara Sosa',
      '0984721440',
      NULL,
      'sara sosa'
    ),
    (
      v_empresa_id,
      'Sara Torres',
      '0974268960',
      NULL,
      'sara torres'
    ),
    (
      v_empresa_id,
      'Sara Vazquez',
      '0994884212',
      NULL,
      'sara vazquez'
    ),
    (
      v_empresa_id,
      'Sara Venegas',
      '0983711207',
      NULL,
      'sara venegas'
    ),
    (
      v_empresa_id,
      'Sara Veron',
      '0982702560',
      NULL,
      'sara veron'
    ),
    (
      v_empresa_id,
      'Sara Zalazar',
      '0982750041',
      NULL,
      'sara zalazar'
    ),
    (
      v_empresa_id,
      'Sara Zanina',
      '0986690797',
      NULL,
      'sara zanina'
    ),
    (
      v_empresa_id,
      'Sara Zelaya',
      '0981362846',
      '10mil',
      'sara zelaya'
    ),
    (
      v_empresa_id,
      'Sasha Carales',
      '0992964173',
      NULL,
      'sasha carales'
    ),
    (
      v_empresa_id,
      'Sasha Casuriaga',
      '0991870243',
      NULL,
      'sasha casuriaga'
    ),
    (
      v_empresa_id,
      'Sebastian Acosta',
      '0984803242',
      '30MIL',
      'sebastian acosta'
    ),
    (
      v_empresa_id,
      'Sebastian Figueredo',
      '0983892105',
      NULL,
      'sebastian figueredo'
    ),
    (
      v_empresa_id,
      'Sebastian Radice',
      '0991324701',
      '1 selo (1)',
      'sebastian radice'
    ),
    (
      v_empresa_id,
      'Sebastian Rodriguez',
      '0984492529',
      NULL,
      'sebastian rodriguez'
    ),
    (
      v_empresa_id,
      'Selena Aguero',
      '0972477015',
      NULL,
      'selena aguero'
    ),
    (
      v_empresa_id,
      'Selene Benitez',
      '0992244634',
      NULL,
      'selene benitez'
    ),
    (
      v_empresa_id,
      'Selva Duarte',
      '0991222203',
      NULL,
      'selva duarte'
    ),
    (
      v_empresa_id,
      'Serena Ocampos',
      '0986749920',
      NULL,
      'serena ocampos'
    ),
    (
      v_empresa_id,
      'Sergio Canete',
      '0981807878',
      NULL,
      'sergio canete'
    ),
    (
      v_empresa_id,
      'Sergio Guearin',
      '0991951384',
      NULL,
      'sergio guearin'
    ),
    (
      v_empresa_id,
      'Sergio Ira Ira',
      '0984617269',
      NULL,
      'sergio ira ira'
    ),
    (
      v_empresa_id,
      'Sergio Martinez',
      '98573700',
      NULL,
      'sergio martinez'
    ),
    (
      v_empresa_id,
      'Sets LYF',
      NULL,
      NULL,
      'sets lyf'
    ),
    (
      v_empresa_id,
      'Shadia Safadi',
      '0994885000',
      '20mil',
      'shadia safadi'
    ),
    (
      v_empresa_id,
      'Shania Funk',
      '0983114526',
      NULL,
      'shania funk'
    ),
    (
      v_empresa_id,
      'Sharol Garai',
      '0992436899',
      NULL,
      'sharol garai'
    ),
    (
      v_empresa_id,
      'Sharon Conrad',
      '0986757627',
      NULL,
      'sharon conrad'
    ),
    (
      v_empresa_id,
      'Sharon Fox',
      '0971777434',
      NULL,
      'sharon fox'
    ),
    (
      v_empresa_id,
      'Sharon Lopez',
      '0983946696',
      NULL,
      'sharon lopez'
    ),
    (
      v_empresa_id,
      'Sheila Carodozo',
      '0971244860',
      NULL,
      'sheila carodozo'
    ),
    (
      v_empresa_id,
      'Sheila Gonzalez',
      '0985118048',
      NULL,
      'sheila gonzalez'
    ),
    (
      v_empresa_id,
      'Sheila Vargas',
      '0982352050',
      NULL,
      'sheila vargas'
    ),
    (
      v_empresa_id,
      'Sheila Yaluff',
      '0984421028',
      NULL,
      'sheila yaluff'
    ),
    (
      v_empresa_id,
      'Sherley Cantero',
      '0986791367',
      NULL,
      'sherley cantero'
    ),
    (
      v_empresa_id,
      'Sherley Nunez',
      '0991902306',
      NULL,
      'sherley nunez'
    ),
    (
      v_empresa_id,
      'Sherly Hildebrand',
      '0973123915',
      NULL,
      'sherly hildebrand'
    ),
    (
      v_empresa_id,
      'Sheyla Alonso',
      '0976114849',
      NULL,
      'sheyla alonso'
    ),
    (
      v_empresa_id,
      'Sheyla Yaluff',
      '0984421028',
      NULL,
      'sheyla yaluff'
    ),
    (
      v_empresa_id,
      'Shiara Kinter',
      '0983940031',
      NULL,
      'shiara kinter'
    ),
    (
      v_empresa_id,
      'Shiloh Toledo',
      '0982207957',
      NULL,
      'shiloh toledo'
    ),
    (
      v_empresa_id,
      'Shir De Jesus',
      NULL,
      NULL,
      'shir de jesus'
    ),
    (
      v_empresa_id,
      'Shirley Arguello',
      '0976171637',
      '10mil',
      'shirley arguello'
    ),
    (
      v_empresa_id,
      'Shirley Candia',
      '0992689016',
      NULL,
      'shirley candia'
    ),
    (
      v_empresa_id,
      'Shirley Canete',
      '0991943533',
      NULL,
      'shirley canete'
    ),
    (
      v_empresa_id,
      'Shirley Cespdes',
      '0972212160',
      '20mil',
      'shirley cespdes'
    ),
    (
      v_empresa_id,
      'Shirley Franco',
      '0981916292',
      NULL,
      'shirley franco'
    ),
    (
      v_empresa_id,
      'Shirley Gimenez',
      '0972148029',
      NULL,
      'shirley gimenez'
    ),
    (
      v_empresa_id,
      'Shirley Lopez',
      '0986920624',
      NULL,
      'shirley lopez'
    ),
    (
      v_empresa_id,
      'Shirley Lovera',
      '0983882269',
      NULL,
      'shirley lovera'
    ),
    (
      v_empresa_id,
      'Shirley Ocampos',
      '0983350853',
      NULL,
      'shirley ocampos'
    ),
    (
      v_empresa_id,
      'Shirley Rojas',
      '0992474023',
      NULL,
      'shirley rojas'
    ),
    (
      v_empresa_id,
      'Shirley Silva',
      '0982227737',
      NULL,
      'shirley silva'
    ),
    (
      v_empresa_id,
      'Shirley Vera',
      '0985101261',
      NULL,
      'shirley vera'
    ),
    (
      v_empresa_id,
      'Shirley Villamallor',
      '0972250265',
      NULL,
      'shirley villamallor'
    ),
    (
      v_empresa_id,
      'Shirley Zaya',
      '0985825902',
      '30MIL',
      'shirley zaya'
    ),
    (
      v_empresa_id,
      'Shopingg 99',
      NULL,
      NULL,
      'shopingg 99'
    ),
    (
      v_empresa_id,
      'Shopping 99',
      NULL,
      NULL,
      'shopping 99'
    ),
    (
      v_empresa_id,
      'Shopping Asia',
      NULL,
      NULL,
      'shopping asia'
    ),
    (
      v_empresa_id,
      'Shopping Itaipu',
      NULL,
      NULL,
      'shopping itaipu'
    ),
    (
      v_empresa_id,
      'Shopping K',
      NULL,
      NULL,
      'shopping k'
    ),
    (
      v_empresa_id,
      'Shortcitos',
      NULL,
      NULL,
      'shortcitos'
    ),
    (
      v_empresa_id,
      'Shortcitos Tassi',
      NULL,
      NULL,
      'shortcitos tassi'
    ),
    (
      v_empresa_id,
      'Silvana Britez',
      '0972506672',
      NULL,
      'silvana britez'
    ),
    (
      v_empresa_id,
      'Silvana Lezcano',
      '0981272654',
      NULL,
      'silvana lezcano'
    ),
    (
      v_empresa_id,
      'Silvana Mendez',
      '0984150888',
      NULL,
      'silvana mendez'
    ),
    (
      v_empresa_id,
      'Silvana Nunes',
      '0994923895',
      NULL,
      'silvana nunes'
    ),
    (
      v_empresa_id,
      'Silvana Riquelme',
      '0971133144',
      NULL,
      'silvana riquelme'
    ),
    (
      v_empresa_id,
      'Silvana Vega',
      '0994566177',
      NULL,
      'silvana vega'
    ),
    (
      v_empresa_id,
      'Silvana Victtone',
      '34601135847',
      NULL,
      'silvana victtone'
    ),
    (
      v_empresa_id,
      'SilvanaTalavera',
      '0982403324',
      NULL,
      'silvanatalavera'
    ),
    (
      v_empresa_id,
      'Silvia Amarilla',
      '0972616615',
      NULL,
      'silvia amarilla'
    ),
    (
      v_empresa_id,
      'Silvia Arguello',
      '0981978071',
      NULL,
      'silvia arguello'
    ),
    (
      v_empresa_id,
      'Silvia Ayala',
      '0982622048',
      NULL,
      'silvia ayala'
    ),
    (
      v_empresa_id,
      'Silvia Belen Britez',
      '0985618100',
      NULL,
      'silvia belen britez'
    ),
    (
      v_empresa_id,
      'Silvia Benialgo',
      NULL,
      NULL,
      'silvia benialgo'
    ),
    (
      v_empresa_id,
      'Silvia Benitez',
      '9923499425',
      NULL,
      'silvia benitez'
    ),
    (
      v_empresa_id,
      'Silvia Britez',
      '0985618100',
      NULL,
      'silvia britez'
    ),
    (
      v_empresa_id,
      'Silvia Cabrera',
      '0981914363',
      '20MIL',
      'silvia cabrera'
    ),
    (
      v_empresa_id,
      'Silvia Casco',
      '0981100237',
      NULL,
      'silvia casco'
    ),
    (
      v_empresa_id,
      'Silvia Galloso',
      '0991651998',
      NULL,
      'silvia galloso'
    ),
    (
      v_empresa_id,
      'Silvia Lesmo',
      '0992314267',
      NULL,
      'silvia lesmo'
    ),
    (
      v_empresa_id,
      'Silvia Lopez',
      '0972815673',
      NULL,
      'silvia lopez'
    ),
    (
      v_empresa_id,
      'Silvia Miranda',
      '0985375706',
      '1 selo (1)',
      'silvia miranda'
    ),
    (
      v_empresa_id,
      'Silvia Nunez',
      '0975116113',
      NULL,
      'silvia nunez'
    ),
    (
      v_empresa_id,
      'Silvia Penayo',
      '0983321657',
      NULL,
      'silvia penayo'
    ),
    (
      v_empresa_id,
      'Silvia Pereira',
      '0981103164',
      NULL,
      'silvia pereira'
    ),
    (
      v_empresa_id,
      'Silvia Sanchez',
      '0991774111',
      '10MIL',
      'silvia sanchez'
    ),
    (
      v_empresa_id,
      'Silvia Santacruz',
      '0983483444',
      NULL,
      'silvia santacruz'
    ),
    (
      v_empresa_id,
      'Silvia Villalba',
      '0986225381',
      NULL,
      'silvia villalba'
    ),
    (
      v_empresa_id,
      'Silvia Yegros',
      '0982611705',
      '10mil',
      'silvia yegros'
    ),
    (
      v_empresa_id,
      'Silvina Aliente',
      '0981575552',
      NULL,
      'silvina aliente'
    ),
    (
      v_empresa_id,
      'Silvina Venialgo',
      '0985462467',
      NULL,
      'silvina venialgo'
    ),
    (
      v_empresa_id,
      'Sindy Negro',
      '0981900411',
      NULL,
      'sindy negro'
    ),
    (
      v_empresa_id,
      'Sobras',
      NULL,
      NULL,
      'sobras'
    ),
    (
      v_empresa_id,
      'Sofia Abramian',
      '3512921377',
      NULL,
      'sofia abramian'
    ),
    (
      v_empresa_id,
      'Sofia Aguilera',
      '0981766519',
      NULL,
      'sofia aguilera'
    ),
    (
      v_empresa_id,
      'Sofia Almiron',
      '0982667505',
      '10mil',
      'sofia almiron'
    ),
    (
      v_empresa_id,
      'Sofia Aquino',
      '0973408363',
      NULL,
      'sofia aquino'
    ),
    (
      v_empresa_id,
      'Sofia Arriola',
      '0984966718',
      NULL,
      'sofia arriola'
    ),
    (
      v_empresa_id,
      'Sofia Chun',
      '0983955510',
      NULL,
      'sofia chun'
    ),
    (
      v_empresa_id,
      'Sofia Clameett',
      '0985170909',
      '20mil',
      'sofia clameett'
    ),
    (
      v_empresa_id,
      'Sofia Colinas',
      '0984750516',
      NULL,
      'sofia colinas'
    ),
    (
      v_empresa_id,
      'Sofia Escorzara',
      '0981788446',
      NULL,
      'sofia escorzara'
    ),
    (
      v_empresa_id,
      'Sofia Fernandez',
      '0982697728',
      NULL,
      'sofia fernandez'
    ),
    (
      v_empresa_id,
      'Sofia Fleitas',
      '0985564760',
      NULL,
      'sofia fleitas'
    ),
    (
      v_empresa_id,
      'Sofia Gamarra',
      '0974504430',
      NULL,
      'sofia gamarra'
    ),
    (
      v_empresa_id,
      'Sofia Gauto',
      '0983434037',
      NULL,
      'sofia gauto'
    ),
    (
      v_empresa_id,
      'Sofia Giudice',
      '0972875612',
      NULL,
      'sofia giudice'
    ),
    (
      v_empresa_id,
      'Sofia Gonzalez',
      '0962255479',
      NULL,
      'sofia gonzalez'
    ),
    (
      v_empresa_id,
      'Sofia Hermosa',
      '0983286877',
      NULL,
      'sofia hermosa'
    ),
    (
      v_empresa_id,
      'Sofia Leith',
      '0994245160',
      '1 selo(1)',
      'sofia leith'
    ),
    (
      v_empresa_id,
      'Sofia Llano',
      '0961870510',
      '10MIL',
      'sofia llano'
    ),
    (
      v_empresa_id,
      'Sofia Lopez',
      '0981945292',
      NULL,
      'sofia lopez'
    ),
    (
      v_empresa_id,
      'Sofia Maqui',
      '0971377012',
      NULL,
      'sofia maqui'
    ),
    (
      v_empresa_id,
      'Sofia Mendez',
      '0991206646',
      NULL,
      'sofia mendez'
    ),
    (
      v_empresa_id,
      'Sofia Murto',
      '0981536949',
      NULL,
      'sofia murto'
    ),
    (
      v_empresa_id,
      'Sofia Nunez',
      '0983860929',
      NULL,
      'sofia nunez'
    ),
    (
      v_empresa_id,
      'Sofia Palma',
      NULL,
      NULL,
      'sofia palma'
    ),
    (
      v_empresa_id,
      'Sofia Quintana',
      '0973408363',
      NULL,
      'sofia quintana'
    ),
    (
      v_empresa_id,
      'Sofia Ramos',
      '0971202702',
      NULL,
      'sofia ramos'
    ),
    (
      v_empresa_id,
      'Sofia Riveros',
      '0985400859',
      NULL,
      'sofia riveros'
    ),
    (
      v_empresa_id,
      'Sofia Rodriguez',
      '0994264931',
      NULL,
      'sofia rodriguez'
    ),
    (
      v_empresa_id,
      'Sofia Rojas',
      '0983267032',
      NULL,
      'sofia rojas'
    ),
    (
      v_empresa_id,
      'Sofia Saggia',
      '0994649258',
      '1 selo (1)',
      'sofia saggia'
    ),
    (
      v_empresa_id,
      'Sofia Scorzara',
      '0981788446',
      NULL,
      'sofia scorzara'
    ),
    (
      v_empresa_id,
      'Sofia Servin',
      '0984904996',
      NULL,
      'sofia servin'
    ),
    (
      v_empresa_id,
      'Sofia Sosa',
      '0992448993',
      NULL,
      'sofia sosa'
    ),
    (
      v_empresa_id,
      'Sofia Tijera',
      '0986281242',
      NULL,
      'sofia tijera'
    ),
    (
      v_empresa_id,
      'Sofia Velazquez',
      '0991233526',
      NULL,
      'sofia velazquez'
    ),
    (
      v_empresa_id,
      'Sofia Villar',
      '0971100267',
      '1 selo (2)',
      'sofia villar'
    ),
    (
      v_empresa_id,
      'Sofpia Clampttpe',
      '0985170909',
      NULL,
      'sofpia clampttpe'
    ),
    (
      v_empresa_id,
      'Sol',
      NULL,
      NULL,
      'sol'
    ),
    (
      v_empresa_id,
      'Sol Alvarenga',
      '0981251880',
      NULL,
      'sol alvarenga'
    ),
    (
      v_empresa_id,
      'Sol Benitez',
      '0991433380',
      NULL,
      'sol benitez'
    ),
    (
      v_empresa_id,
      'Sol Cabanas',
      '0986421314',
      NULL,
      'sol cabanas'
    ),
    (
      v_empresa_id,
      'Sol Colandi',
      '0994356835',
      NULL,
      'sol colandi'
    ),
    (
      v_empresa_id,
      'Sol Escurra',
      '0991424356',
      NULL,
      'sol escurra'
    ),
    (
      v_empresa_id,
      'Sol Fernando',
      '0992297291',
      '20mil',
      'sol fernando'
    ),
    (
      v_empresa_id,
      'Sol Galeano',
      '0974997738',
      NULL,
      'sol galeano'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 11: filas 5001..5500
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Sol Mayra Gonzalez',
      '0986108790',
      NULL,
      'sol mayra gonzalez'
    ),
    (
      v_empresa_id,
      'Sol Miranda',
      NULL,
      NULL,
      'sol miranda'
    ),
    (
      v_empresa_id,
      'Sol Rojas',
      '0981373337',
      '10mil',
      'sol rojas'
    ),
    (
      v_empresa_id,
      'Sol Ruiz Diaz',
      '0981236691',
      NULL,
      'sol ruiz diaz'
    ),
    (
      v_empresa_id,
      'Sol Sanabria',
      '0981670302',
      NULL,
      'sol sanabria'
    ),
    (
      v_empresa_id,
      'Sol Torres',
      '0961909226',
      NULL,
      'sol torres'
    ),
    (
      v_empresa_id,
      'Sol Zarate',
      '0994561871',
      '1 selo (1)',
      'sol zarate'
    ),
    (
      v_empresa_id,
      'Solange Recaldo',
      '0991278888',
      NULL,
      'solange recaldo'
    ),
    (
      v_empresa_id,
      'Soledad Artines',
      '0971147464',
      NULL,
      'soledad artines'
    ),
    (
      v_empresa_id,
      'Soledad Borja',
      '0976412613',
      '30mil',
      'soledad borja'
    ),
    (
      v_empresa_id,
      'Soledad Carranza',
      '0986820699',
      NULL,
      'soledad carranza'
    ),
    (
      v_empresa_id,
      'Soledad Duarte',
      '0982429294',
      NULL,
      'soledad duarte'
    ),
    (
      v_empresa_id,
      'Soledad Escobar',
      '0984276545',
      NULL,
      'soledad escobar'
    ),
    (
      v_empresa_id,
      'Soledad Espinola',
      '0981686006',
      NULL,
      'soledad espinola'
    ),
    (
      v_empresa_id,
      'Soledad Galeano',
      '0981757082',
      NULL,
      'soledad galeano'
    ),
    (
      v_empresa_id,
      'Soledad Gini',
      '0982159353',
      NULL,
      'soledad gini'
    ),
    (
      v_empresa_id,
      'Soledad Lescano',
      '0982129585',
      '10mil',
      'soledad lescano'
    ),
    (
      v_empresa_id,
      'Soledad Portillo',
      '0991792299',
      NULL,
      'soledad portillo'
    ),
    (
      v_empresa_id,
      'Soledad Rios',
      '0986937369',
      NULL,
      'soledad rios'
    ),
    (
      v_empresa_id,
      'Soledad Talavera',
      '0984372632',
      NULL,
      'soledad talavera'
    ),
    (
      v_empresa_id,
      'Soledad Telles',
      '0981971581',
      NULL,
      'soledad telles'
    ),
    (
      v_empresa_id,
      'Soledad Torres',
      '0991195791',
      NULL,
      'soledad torres'
    ),
    (
      v_empresa_id,
      'Soledad Villagra',
      '0982557996',
      NULL,
      'soledad villagra'
    ),
    (
      v_empresa_id,
      'Sonia',
      NULL,
      NULL,
      'sonia'
    ),
    (
      v_empresa_id,
      'Sonia (Tassi)',
      NULL,
      NULL,
      'sonia (tassi)'
    ),
    (
      v_empresa_id,
      'Sonia alvarez',
      '0981314268',
      NULL,
      'sonia alvarez'
    ),
    (
      v_empresa_id,
      'Sonia Arevalos',
      '0976220439',
      NULL,
      'sonia arevalos'
    ),
    (
      v_empresa_id,
      'Sonia Ayalla',
      '0984526070',
      NULL,
      'sonia ayalla'
    ),
    (
      v_empresa_id,
      'Sonia Cristaldo',
      '0992352691',
      NULL,
      'sonia cristaldo'
    ),
    (
      v_empresa_id,
      'Sonia Delgado',
      '0972249739',
      NULL,
      'sonia delgado'
    ),
    (
      v_empresa_id,
      'Sonia Fernandez',
      '0991822573',
      NULL,
      'sonia fernandez'
    ),
    (
      v_empresa_id,
      'Sonia Franco',
      '0985929772',
      NULL,
      'sonia franco'
    ),
    (
      v_empresa_id,
      'Sonia Garcia',
      '0983168637',
      '30mil',
      'sonia garcia'
    ),
    (
      v_empresa_id,
      'Sonia Gimenez',
      '0971254602',
      NULL,
      'sonia gimenez'
    ),
    (
      v_empresa_id,
      'Sonia Gomez',
      '0981483124',
      '1 selo (2)',
      'sonia gomez'
    ),
    (
      v_empresa_id,
      'Sonia Lopez',
      '0981784599',
      NULL,
      'sonia lopez'
    ),
    (
      v_empresa_id,
      'Sonia Mae Juliana',
      NULL,
      NULL,
      'sonia mae juliana'
    ),
    (
      v_empresa_id,
      'Sonia Ortiz',
      '0971322515',
      NULL,
      'sonia ortiz'
    ),
    (
      v_empresa_id,
      'Sonia Rojas',
      '0982428449',
      NULL,
      'sonia rojas'
    ),
    (
      v_empresa_id,
      'Sonia Uriarte',
      '0991521344',
      NULL,
      'sonia uriarte'
    ),
    (
      v_empresa_id,
      'Sonia Villalba',
      '0982528589',
      NULL,
      'sonia villalba'
    ),
    (
      v_empresa_id,
      'Sonia Yeruta',
      '0981646973',
      '20mil',
      'sonia yeruta'
    ),
    (
      v_empresa_id,
      'Sophie De Madrignac',
      '0985709641',
      NULL,
      'sophie de madrignac'
    ),
    (
      v_empresa_id,
      'Soraida Ibarra',
      '0971223051',
      NULL,
      'soraida ibarra'
    ),
    (
      v_empresa_id,
      'Soraida Rojas',
      '0972384978',
      NULL,
      'soraida rojas'
    ),
    (
      v_empresa_id,
      'Spie',
      '0981455457',
      '1 selo (4)',
      'spie'
    ),
    (
      v_empresa_id,
      'Sra Barreto',
      '0971982478',
      NULL,
      'sra barreto'
    ),
    (
      v_empresa_id,
      'Srgio Damian',
      '0971197384',
      NULL,
      'srgio damian'
    ),
    (
      v_empresa_id,
      'Srgio iraira',
      '0984617269',
      NULL,
      'srgio iraira'
    ),
    (
      v_empresa_id,
      'Stefani Barrios',
      '0983932720',
      NULL,
      'stefani barrios'
    ),
    (
      v_empresa_id,
      'Stefani Dyck',
      '0971596264',
      NULL,
      'stefani dyck'
    ),
    (
      v_empresa_id,
      'Stefania Lopez',
      '0971159598',
      NULL,
      'stefania lopez'
    ),
    (
      v_empresa_id,
      'Stefania Salinas',
      '0991733003',
      '1 selo (2)',
      'stefania salinas'
    ),
    (
      v_empresa_id,
      'Stefania Santalio',
      '0982740323',
      NULL,
      'stefania santalio'
    ),
    (
      v_empresa_id,
      'Steffi Vasquez',
      '0972242936',
      NULL,
      'steffi vasquez'
    ),
    (
      v_empresa_id,
      'Stefi Urrustarazu',
      '0992245786',
      '1 selo (1)',
      'stefi urrustarazu'
    ),
    (
      v_empresa_id,
      'Stefi Urrustrazu',
      '0992245786',
      NULL,
      'stefi urrustrazu'
    ),
    (
      v_empresa_id,
      'Stella Driedgen',
      NULL,
      NULL,
      'stella driedgen'
    ),
    (
      v_empresa_id,
      'Stiven Baez',
      '0981197789',
      NULL,
      'stiven baez'
    ),
    (
      v_empresa_id,
      'Sueli Cabral',
      '0984670955',
      NULL,
      'sueli cabral'
    ),
    (
      v_empresa_id,
      'Suely Ayala',
      '0972683009',
      NULL,
      'suely ayala'
    ),
    (
      v_empresa_id,
      'Super K',
      NULL,
      NULL,
      'super k'
    ),
    (
      v_empresa_id,
      'super K Cde',
      NULL,
      NULL,
      'super k cde'
    ),
    (
      v_empresa_id,
      'Susan Hermosilla',
      '0994985156',
      '10mil',
      'susan hermosilla'
    ),
    (
      v_empresa_id,
      'Susan Otazu',
      '0972125995',
      '10mil',
      'susan otazu'
    ),
    (
      v_empresa_id,
      'Susana Acosta',
      '0994250366',
      NULL,
      'susana acosta'
    ),
    (
      v_empresa_id,
      'Susana Ayala',
      '0983446962',
      NULL,
      'susana ayala'
    ),
    (
      v_empresa_id,
      'Susana Cuellar',
      '0982314712',
      NULL,
      'susana cuellar'
    ),
    (
      v_empresa_id,
      'Susana De Moratal',
      '0982133601',
      NULL,
      'susana de moratal'
    ),
    (
      v_empresa_id,
      'Susana Fernandez',
      '0985494942',
      '1 selo (1)',
      'susana fernandez'
    ),
    (
      v_empresa_id,
      'Susana Gullari',
      '0981936400',
      NULL,
      'susana gullari'
    ),
    (
      v_empresa_id,
      'Susana Nolbin',
      '0982859821',
      NULL,
      'susana nolbin'
    ),
    (
      v_empresa_id,
      'Susana Pita',
      '0982661095',
      NULL,
      'susana pita'
    ),
    (
      v_empresa_id,
      'Susana Ruiz Diaz',
      '0982345778',
      NULL,
      'susana ruiz diaz'
    ),
    (
      v_empresa_id,
      'Susana Villalba',
      '0995696400',
      NULL,
      'susana villalba'
    ),
    (
      v_empresa_id,
      'Suyi Lesme',
      '0976907968',
      NULL,
      'suyi lesme'
    ),
    (
      v_empresa_id,
      'Sydel Salinas',
      '0986723465',
      NULL,
      'sydel salinas'
    ),
    (
      v_empresa_id,
      'Sylavana Torres',
      '0994768872',
      '10MIL',
      'sylavana torres'
    ),
    (
      v_empresa_id,
      'Taai (Rafa)',
      NULL,
      NULL,
      'taai (rafa)'
    ),
    (
      v_empresa_id,
      'Taamara Maldonado',
      '0992571736',
      NULL,
      'taamara maldonado'
    ),
    (
      v_empresa_id,
      'Talia Aquino',
      '0986878020',
      NULL,
      'talia aquino'
    ),
    (
      v_empresa_id,
      'Talia Lopez',
      '0982957020',
      NULL,
      'talia lopez'
    ),
    (
      v_empresa_id,
      'Talia Sanguina',
      '0993410066',
      NULL,
      'talia sanguina'
    ),
    (
      v_empresa_id,
      'Talia Servin',
      '0991856530',
      NULL,
      'talia servin'
    ),
    (
      v_empresa_id,
      'Talia Stanley',
      '0971987657',
      NULL,
      'talia stanley'
    ),
    (
      v_empresa_id,
      'Tamara Aguilar',
      '0991725683',
      NULL,
      'tamara aguilar'
    ),
    (
      v_empresa_id,
      'Tamara Andino',
      '0972186501',
      NULL,
      'tamara andino'
    ),
    (
      v_empresa_id,
      'Tamara Araujo',
      '0982545211',
      NULL,
      'tamara araujo'
    ),
    (
      v_empresa_id,
      'Tamara Bogadp',
      '0991665693',
      NULL,
      'tamara bogadp'
    ),
    (
      v_empresa_id,
      'Tamara Britos',
      '0992655224',
      NULL,
      'tamara britos'
    ),
    (
      v_empresa_id,
      'Tamara Caballero',
      '0986210712',
      NULL,
      'tamara caballero'
    ),
    (
      v_empresa_id,
      'Tamara Caceres',
      '0985409476',
      '20MIL',
      'tamara caceres'
    ),
    (
      v_empresa_id,
      'Tamara Caeteveke',
      '0986330303',
      NULL,
      'tamara caeteveke'
    ),
    (
      v_empresa_id,
      'Tamara Cardozo',
      '0971792281',
      '30mil',
      'tamara cardozo'
    ),
    (
      v_empresa_id,
      'Tamara coronel',
      '0976571519',
      NULL,
      'tamara coronel'
    ),
    (
      v_empresa_id,
      'Tamara Figueredo',
      '0983207718',
      NULL,
      'tamara figueredo'
    ),
    (
      v_empresa_id,
      'Tamara Fiorotto',
      '0992925702',
      NULL,
      'tamara fiorotto'
    ),
    (
      v_empresa_id,
      'Tamara Gomez',
      '0983688637',
      NULL,
      'tamara gomez'
    ),
    (
      v_empresa_id,
      'Tamara Gonzalez',
      '0983866231',
      NULL,
      'tamara gonzalez'
    ),
    (
      v_empresa_id,
      'Tamara Hiebrt',
      '0981781459',
      NULL,
      'tamara hiebrt'
    ),
    (
      v_empresa_id,
      'Tamara Maldonado',
      '0992571737',
      NULL,
      'tamara maldonado'
    ),
    (
      v_empresa_id,
      'Tamara Mancuello',
      '0972345947',
      NULL,
      'tamara mancuello'
    ),
    (
      v_empresa_id,
      'Tamara maricevch',
      '0982876351',
      NULL,
      'tamara maricevch'
    ),
    (
      v_empresa_id,
      'Tamara Navarro',
      '0991632145',
      NULL,
      'tamara navarro'
    ),
    (
      v_empresa_id,
      'Tamara Ojeda',
      '0971675225',
      NULL,
      'tamara ojeda'
    ),
    (
      v_empresa_id,
      'Tamara Ortiz',
      '0973401565',
      '10mil',
      'tamara ortiz'
    ),
    (
      v_empresa_id,
      'Tamara Peralta',
      '0982399298',
      '30MIL',
      'tamara peralta'
    ),
    (
      v_empresa_id,
      'Tamara Rodriguez',
      '0994133103',
      NULL,
      'tamara rodriguez'
    ),
    (
      v_empresa_id,
      'Tamara Saucedo',
      '0992731348',
      NULL,
      'tamara saucedo'
    ),
    (
      v_empresa_id,
      'Tamara Solis',
      '0982255135',
      NULL,
      'tamara solis'
    ),
    (
      v_empresa_id,
      'Tamara Wiebe',
      '0983999842',
      '10mil',
      'tamara wiebe'
    ),
    (
      v_empresa_id,
      'Tania Ayala',
      '0971182980',
      NULL,
      'tania ayala'
    ),
    (
      v_empresa_id,
      'Tania Benitez',
      '0976103285',
      '10mil',
      'tania benitez'
    ),
    (
      v_empresa_id,
      'Tania Cabezudo',
      '0981935798',
      NULL,
      'tania cabezudo'
    ),
    (
      v_empresa_id,
      'Tania Centurion',
      '0971967134',
      NULL,
      'tania centurion'
    ),
    (
      v_empresa_id,
      'Tania Cespedes',
      '0986522955',
      NULL,
      'tania cespedes'
    ),
    (
      v_empresa_id,
      'Tania Colman',
      '0984688023',
      NULL,
      'tania colman'
    ),
    (
      v_empresa_id,
      'Tania Diaz',
      '0981781123',
      NULL,
      'tania diaz'
    ),
    (
      v_empresa_id,
      'Tania Fernandez',
      '0984719981',
      NULL,
      'tania fernandez'
    ),
    (
      v_empresa_id,
      'Tania Gimenez',
      '0994110368',
      NULL,
      'tania gimenez'
    ),
    (
      v_empresa_id,
      'Tania Gomez',
      '0972700660',
      NULL,
      'tania gomez'
    ),
    (
      v_empresa_id,
      'Tania Gonzalez',
      '0992410281',
      NULL,
      'tania gonzalez'
    ),
    (
      v_empresa_id,
      'Tania Grau',
      '0981224021',
      NULL,
      'tania grau'
    ),
    (
      v_empresa_id,
      'Tania Lescano',
      '0974879088',
      NULL,
      'tania lescano'
    ),
    (
      v_empresa_id,
      'Tania Miltos',
      '0981544608',
      NULL,
      'tania miltos'
    ),
    (
      v_empresa_id,
      'Tania Monsot',
      '0971603836',
      NULL,
      'tania monsot'
    ),
    (
      v_empresa_id,
      'Tania Navarro',
      '0994208435',
      '10MIL',
      'tania navarro'
    ),
    (
      v_empresa_id,
      'Tania Ortega',
      '0987375750',
      '30MIL',
      'tania ortega'
    ),
    (
      v_empresa_id,
      'Tania Perez',
      '0972222030',
      '20mil',
      'tania perez'
    ),
    (
      v_empresa_id,
      'Tania Rodriguez',
      '0985807117',
      '30mil',
      'tania rodriguez'
    ),
    (
      v_empresa_id,
      'Tania Romina Cuba',
      '0981258275',
      NULL,
      'tania romina cuba'
    ),
    (
      v_empresa_id,
      'Tania Sardi',
      '0981243455',
      NULL,
      'tania sardi'
    ),
    (
      v_empresa_id,
      'Tania Vargas',
      '0971207261',
      NULL,
      'tania vargas'
    ),
    (
      v_empresa_id,
      'Tania Vera',
      '0992229631',
      NULL,
      'tania vera'
    ),
    (
      v_empresa_id,
      'Tassi (Luca)',
      NULL,
      NULL,
      'tassi (luca)'
    ),
    (
      v_empresa_id,
      'Tassi (mercado)',
      NULL,
      NULL,
      'tassi (mercado)'
    ),
    (
      v_empresa_id,
      'Tassi (Olivia)',
      NULL,
      NULL,
      'tassi (olivia)'
    ),
    (
      v_empresa_id,
      'Tassi Arete',
      NULL,
      NULL,
      'tassi arete'
    ),
    (
      v_empresa_id,
      'tassi aros sp',
      NULL,
      NULL,
      'tassi aros sp'
    ),
    (
      v_empresa_id,
      'Tassi Diniz',
      NULL,
      NULL,
      'tassi diniz'
    ),
    (
      v_empresa_id,
      'Tassi La nueva',
      NULL,
      NULL,
      'tassi la nueva'
    ),
    (
      v_empresa_id,
      'Tatiana Arce',
      '0984549877',
      NULL,
      'tatiana arce'
    ),
    (
      v_empresa_id,
      'Tatiana Aveiro',
      '0972964607',
      NULL,
      'tatiana aveiro'
    ),
    (
      v_empresa_id,
      'Tatiana Barreto',
      '0994171777',
      NULL,
      'tatiana barreto'
    ),
    (
      v_empresa_id,
      'Tatiana Bauza',
      '0983921821',
      NULL,
      'tatiana bauza'
    ),
    (
      v_empresa_id,
      'Tatiana Benitez',
      '0976564460',
      '30MIL',
      'tatiana benitez'
    ),
    (
      v_empresa_id,
      'Tatiana Delgado',
      '0991474054',
      '10mil',
      'tatiana delgado'
    ),
    (
      v_empresa_id,
      'Tatiana Erofeeva',
      '0991245453',
      '30mil',
      'tatiana erofeeva'
    ),
    (
      v_empresa_id,
      'Tatiana Espinola',
      '0986821509',
      '10mil',
      'tatiana espinola'
    ),
    (
      v_empresa_id,
      'Tatiana Esquivel',
      '0974249428',
      NULL,
      'tatiana esquivel'
    ),
    (
      v_empresa_id,
      'Tatiana Fleitas',
      '0984672359',
      NULL,
      'tatiana fleitas'
    ),
    (
      v_empresa_id,
      'Tatiana Gonzalez',
      '0985143460',
      '20mil',
      'tatiana gonzalez'
    ),
    (
      v_empresa_id,
      'Tatiana Maricevich',
      '0981232021',
      NULL,
      'tatiana maricevich'
    ),
    (
      v_empresa_id,
      'Tatiana Mendoza',
      '0985441617',
      NULL,
      'tatiana mendoza'
    ),
    (
      v_empresa_id,
      'Tatiana Mongelos',
      '0984595161',
      NULL,
      'tatiana mongelos'
    ),
    (
      v_empresa_id,
      'Tatiana Ocampos',
      '0986471031',
      NULL,
      'tatiana ocampos'
    ),
    (
      v_empresa_id,
      'Tatiana Ojeda',
      '0971916816',
      NULL,
      'tatiana ojeda'
    ),
    (
      v_empresa_id,
      'Tatiana Ortiz',
      '0992245237',
      NULL,
      'tatiana ortiz'
    ),
    (
      v_empresa_id,
      'Tatiana Paiva',
      '0972292075',
      NULL,
      'tatiana paiva'
    ),
    (
      v_empresa_id,
      'Tatiana Portillo',
      '0981457639',
      NULL,
      'tatiana portillo'
    ),
    (
      v_empresa_id,
      'Tatiana Sanabria',
      '0986177531',
      NULL,
      'tatiana sanabria'
    ),
    (
      v_empresa_id,
      'Tatiana Santander',
      '0984967369',
      '20mil',
      'tatiana santander'
    ),
    (
      v_empresa_id,
      'Telma Aguilera',
      '0972124412',
      NULL,
      'telma aguilera'
    ),
    (
      v_empresa_id,
      'Telma Villasboa',
      '9763955537',
      '10mil',
      'telma villasboa'
    ),
    (
      v_empresa_id,
      'Teofila Godoy',
      '0981414845',
      NULL,
      'teofila godoy'
    ),
    (
      v_empresa_id,
      'Teresa',
      '0981667188',
      NULL,
      'teresa'
    ),
    (
      v_empresa_id,
      'Teresa Benitez',
      '0981665902',
      NULL,
      'teresa benitez'
    ),
    (
      v_empresa_id,
      'Teresa Carrizo',
      '0983394800',
      NULL,
      'teresa carrizo'
    ),
    (
      v_empresa_id,
      'Teresa Gill',
      '0971652713',
      NULL,
      'teresa gill'
    ),
    (
      v_empresa_id,
      'Teresa Maidano',
      '0981282303',
      NULL,
      'teresa maidano'
    ),
    (
      v_empresa_id,
      'Teresa Martinez',
      '0961842119',
      '1 selo (1)',
      'teresa martinez'
    ),
    (
      v_empresa_id,
      'Teresa Morel',
      '0982722700',
      NULL,
      'teresa morel'
    ),
    (
      v_empresa_id,
      'Teresa Rojas',
      '0962141750',
      NULL,
      'teresa rojas'
    ),
    (
      v_empresa_id,
      'Teresa Sanabria',
      '0985996000',
      NULL,
      'teresa sanabria'
    ),
    (
      v_empresa_id,
      'Teresa Villalba',
      '0981667188',
      NULL,
      'teresa villalba'
    ),
    (
      v_empresa_id,
      'Teresita Colman',
      '0992248160',
      NULL,
      'teresita colman'
    ),
    (
      v_empresa_id,
      'Teresita Vega',
      '0982114483',
      NULL,
      'teresita vega'
    ),
    (
      v_empresa_id,
      'Thais Ingles',
      '0961952523',
      NULL,
      'thais ingles'
    ),
    (
      v_empresa_id,
      'Thali Belen Aguilar',
      '0992372496',
      '10MIL',
      'thali belen aguilar'
    ),
    (
      v_empresa_id,
      'Thalia Benitez',
      '0982372648',
      '20mil',
      'thalia benitez'
    ),
    (
      v_empresa_id,
      'Thalia Da rocha',
      '0971823423',
      NULL,
      'thalia da rocha'
    ),
    (
      v_empresa_id,
      'Thalia Ramirez',
      '0975463905',
      NULL,
      'thalia ramirez'
    ),
    (
      v_empresa_id,
      'Thalia Samudio',
      '0982202276',
      NULL,
      'thalia samudio'
    ),
    (
      v_empresa_id,
      'Thamara Mancuello',
      '0972345947',
      NULL,
      'thamara mancuello'
    ),
    (
      v_empresa_id,
      'Thamara Pereira',
      '0985724046',
      NULL,
      'thamara pereira'
    ),
    (
      v_empresa_id,
      'Thamara Villalba',
      '0986638888',
      NULL,
      'thamara villalba'
    ),
    (
      v_empresa_id,
      'Thayna Paulin',
      '0971121736',
      NULL,
      'thayna paulin'
    ),
    (
      v_empresa_id,
      'Thiara Salum',
      '0981804484',
      NULL,
      'thiara salum'
    ),
    (
      v_empresa_id,
      'Thiara Salvioni',
      '9851305250',
      NULL,
      'thiara salvioni'
    ),
    (
      v_empresa_id,
      'Tiago Bogado',
      '0992746883',
      NULL,
      'tiago bogado'
    ),
    (
      v_empresa_id,
      'Tiago Bogarin',
      '0984589732',
      '10mil',
      'tiago bogarin'
    ),
    (
      v_empresa_id,
      'Tiana Phuler',
      '0974461649',
      NULL,
      'tiana phuler'
    ),
    (
      v_empresa_id,
      'Tiara Gomez',
      '0972256656',
      '1 selo (2)',
      'tiara gomez'
    ),
    (
      v_empresa_id,
      'Tirsa Caceres',
      '0991851880',
      NULL,
      'tirsa caceres'
    ),
    (
      v_empresa_id,
      'Tmara Andino',
      '0972186501',
      NULL,
      'tmara andino'
    ),
    (
      v_empresa_id,
      'Tommy Cristaldo',
      '0981228260',
      NULL,
      'tommy cristaldo'
    ),
    (
      v_empresa_id,
      'Transferencia a Lillo',
      NULL,
      NULL,
      'transferencia a lillo'
    ),
    (
      v_empresa_id,
      'Travis Gildebran',
      '0974427015',
      NULL,
      'travis gildebran'
    ),
    (
      v_empresa_id,
      'Trinidad Duarte',
      '0992209579',
      NULL,
      'trinidad duarte'
    ),
    (
      v_empresa_id,
      'Tuvh Aim',
      '0981010901',
      NULL,
      'tuvh aim'
    ),
    (
      v_empresa_id,
      'Ursula Bareiro',
      '0983289350',
      NULL,
      'ursula bareiro'
    ),
    (
      v_empresa_id,
      'Valentina',
      NULL,
      NULL,
      'valentina'
    ),
    (
      v_empresa_id,
      'Valentina Ayala',
      '0991760842',
      NULL,
      'valentina ayala'
    ),
    (
      v_empresa_id,
      'Valentina Blaz',
      '0983201426',
      NULL,
      'valentina blaz'
    ),
    (
      v_empresa_id,
      'Valentina Llano',
      '0981381014',
      '30MIL',
      'valentina llano'
    ),
    (
      v_empresa_id,
      'Valentina Mongelos',
      '0983491927',
      NULL,
      'valentina mongelos'
    ),
    (
      v_empresa_id,
      'Valentina Quintana',
      '0981423730',
      NULL,
      'valentina quintana'
    ),
    (
      v_empresa_id,
      'Valentina Ricciardi',
      NULL,
      NULL,
      'valentina ricciardi'
    ),
    (
      v_empresa_id,
      'Valeria Ayala',
      '0981131159',
      NULL,
      'valeria ayala'
    ),
    (
      v_empresa_id,
      'Valeria Baez',
      '0984521100',
      NULL,
      'valeria baez'
    ),
    (
      v_empresa_id,
      'Valeria Barrios',
      '0971917397',
      '20MIL',
      'valeria barrios'
    ),
    (
      v_empresa_id,
      'Valeria Benitez',
      '0992947600',
      NULL,
      'valeria benitez'
    ),
    (
      v_empresa_id,
      'Valeria Caceres',
      '0984608137',
      NULL,
      'valeria caceres'
    ),
    (
      v_empresa_id,
      'Valeria Dentice',
      '0976975309',
      NULL,
      'valeria dentice'
    ),
    (
      v_empresa_id,
      'Valeria Diaz',
      '0961817861',
      NULL,
      'valeria diaz'
    ),
    (
      v_empresa_id,
      'Valeria Fernandez',
      '0975124044',
      '20MIL',
      'valeria fernandez'
    ),
    (
      v_empresa_id,
      'Valeria Giani',
      '0982521262',
      NULL,
      'valeria giani'
    ),
    (
      v_empresa_id,
      'Valeria Gomez',
      '0984994123',
      '30mil',
      'valeria gomez'
    ),
    (
      v_empresa_id,
      'Valeria Herreros',
      '0981879871',
      NULL,
      'valeria herreros'
    ),
    (
      v_empresa_id,
      'Valeria Llegolos',
      '0971839018',
      NULL,
      'valeria llegolos'
    ),
    (
      v_empresa_id,
      'Valeria Mareco',
      '0985608977',
      NULL,
      'valeria mareco'
    ),
    (
      v_empresa_id,
      'Valeria Martinez',
      '0982638015',
      NULL,
      'valeria martinez'
    ),
    (
      v_empresa_id,
      'Valeria Mercado',
      NULL,
      NULL,
      'valeria mercado'
    ),
    (
      v_empresa_id,
      'Valeria Rios',
      '0983999954',
      NULL,
      'valeria rios'
    ),
    (
      v_empresa_id,
      'Valeria Veltice',
      '0976975309',
      NULL,
      'valeria veltice'
    ),
    (
      v_empresa_id,
      'Valeria Vera',
      '0994279067',
      NULL,
      'valeria vera'
    ),
    (
      v_empresa_id,
      'Vanesa',
      '0982382834',
      NULL,
      'vanesa'
    ),
    (
      v_empresa_id,
      'Vanesa Aguilar',
      '0972154149',
      '10mil',
      'vanesa aguilar'
    ),
    (
      v_empresa_id,
      'Vanesa Almiron',
      '0992296547',
      NULL,
      'vanesa almiron'
    ),
    (
      v_empresa_id,
      'Vanesa Aranda',
      '0992472754',
      NULL,
      'vanesa aranda'
    ),
    (
      v_empresa_id,
      'Vanesa Davalos',
      '0982656909',
      NULL,
      'vanesa davalos'
    ),
    (
      v_empresa_id,
      'Vanesa Espinola',
      '0971934020',
      NULL,
      'vanesa espinola'
    ),
    (
      v_empresa_id,
      'Vanesa Funk',
      '0981180514',
      NULL,
      'vanesa funk'
    ),
    (
      v_empresa_id,
      'Vanesa Genaro',
      '0994709518',
      NULL,
      'vanesa genaro'
    ),
    (
      v_empresa_id,
      'Vanesa Gill',
      '0972787314',
      NULL,
      'vanesa gill'
    ),
    (
      v_empresa_id,
      'Vanesa Gonzalez',
      '0972668806',
      NULL,
      'vanesa gonzalez'
    ),
    (
      v_empresa_id,
      'Vanesa jara',
      '0981149636',
      NULL,
      'vanesa jara'
    ),
    (
      v_empresa_id,
      'Vanesa Martinez',
      '0994767821',
      NULL,
      'vanesa martinez'
    ),
    (
      v_empresa_id,
      'Vanesa Ojeda',
      '0983212533',
      NULL,
      'vanesa ojeda'
    ),
    (
      v_empresa_id,
      'Vanesa Ramirez',
      '0961783837',
      NULL,
      'vanesa ramirez'
    ),
    (
      v_empresa_id,
      'Vanesa Rios',
      '0961789585',
      NULL,
      'vanesa rios'
    ),
    (
      v_empresa_id,
      'Vanesa Rodas',
      '0981927804',
      NULL,
      'vanesa rodas'
    ),
    (
      v_empresa_id,
      'Vanesa Valdez',
      '0973150856',
      NULL,
      'vanesa valdez'
    ),
    (
      v_empresa_id,
      'Vanesa Viola',
      '0981634621',
      NULL,
      'vanesa viola'
    ),
    (
      v_empresa_id,
      'Vanesa Zarate',
      '0974800966',
      NULL,
      'vanesa zarate'
    ),
    (
      v_empresa_id,
      'Vanesa Zelaya',
      '0971875220',
      NULL,
      'vanesa zelaya'
    ),
    (
      v_empresa_id,
      'Vanesaa Ramirez',
      '0981877316',
      NULL,
      'vanesaa ramirez'
    ),
    (
      v_empresa_id,
      'Vanessa Aguilaar',
      '0972154149',
      NULL,
      'vanessa aguilaar'
    ),
    (
      v_empresa_id,
      'Vanessa Araujo',
      '0984902085',
      NULL,
      'vanessa araujo'
    ),
    (
      v_empresa_id,
      'Vanessa Cristaldo',
      '0981394548',
      NULL,
      'vanessa cristaldo'
    ),
    (
      v_empresa_id,
      'Vanessa Cubas',
      '0985228100',
      NULL,
      'vanessa cubas'
    ),
    (
      v_empresa_id,
      'Vanessa Gonzalez',
      '0986723930',
      NULL,
      'vanessa gonzalez'
    ),
    (
      v_empresa_id,
      'Vanessa Graer',
      NULL,
      NULL,
      'vanessa graer'
    ),
    (
      v_empresa_id,
      'Vanessa Lopez',
      '0961967528',
      '20mil',
      'vanessa lopez'
    ),
    (
      v_empresa_id,
      'Vanessa Nunez',
      '0981605853',
      '30mil',
      'vanessa nunez'
    ),
    (
      v_empresa_id,
      'Vanessa Ojeda',
      '0971273140',
      '10mil',
      'vanessa ojeda'
    ),
    (
      v_empresa_id,
      'Vanessa Scarone',
      '0985620260',
      NULL,
      'vanessa scarone'
    ),
    (
      v_empresa_id,
      'Vanessa Viola',
      '0981634621',
      NULL,
      'vanessa viola'
    ),
    (
      v_empresa_id,
      'Vanessa Zelaya',
      '0971875220',
      NULL,
      'vanessa zelaya'
    ),
    (
      v_empresa_id,
      'Vania Avalos',
      '0984122220',
      NULL,
      'vania avalos'
    ),
    (
      v_empresa_id,
      'Vania Aveiro',
      '0981360018',
      NULL,
      'vania aveiro'
    ),
    (
      v_empresa_id,
      'Vania Flecha',
      '0982679119',
      NULL,
      'vania flecha'
    ),
    (
      v_empresa_id,
      'Vania Morinigo',
      '0972184018',
      NULL,
      'vania morinigo'
    ),
    (
      v_empresa_id,
      'Vania Navarro',
      '0981206237',
      NULL,
      'vania navarro'
    ),
    (
      v_empresa_id,
      'Vania Ortiz',
      '0984959576',
      NULL,
      'vania ortiz'
    ),
    (
      v_empresa_id,
      'Vania Pereira',
      '0981537988',
      NULL,
      'vania pereira'
    ),
    (
      v_empresa_id,
      'Vania Quintana',
      '0972226642',
      NULL,
      'vania quintana'
    ),
    (
      v_empresa_id,
      'Vania Sanchez',
      '0991895110',
      NULL,
      'vania sanchez'
    ),
    (
      v_empresa_id,
      'Vanina Albertin',
      '0971132020',
      NULL,
      'vanina albertin'
    ),
    (
      v_empresa_id,
      'Vanina Albertini',
      '0971132020',
      '1 selo (2)',
      'vanina albertini'
    ),
    (
      v_empresa_id,
      'Vanina Areco',
      '0981521654',
      NULL,
      'vanina areco'
    ),
    (
      v_empresa_id,
      'Vanina Carimbu',
      '0971343997',
      NULL,
      'vanina carimbu'
    ),
    (
      v_empresa_id,
      'Vanina Gimenez',
      '0982825227',
      NULL,
      'vanina gimenez'
    ),
    (
      v_empresa_id,
      'Vanina Nunin',
      '0972574370',
      '1 selo (2)',
      'vanina nunin'
    ),
    (
      v_empresa_id,
      'Vanina Sunini',
      '0981495111',
      NULL,
      'vanina sunini'
    ),
    (
      v_empresa_id,
      'Vanina Uperta',
      '0983432800',
      '20mil',
      'vanina uperta'
    ),
    (
      v_empresa_id,
      'Vanina Vicengiter',
      '0985432071',
      NULL,
      'vanina vicengiter'
    ),
    (
      v_empresa_id,
      'Venica Rojas',
      '0986460628',
      NULL,
      'venica rojas'
    ),
    (
      v_empresa_id,
      'Venigna Sanchez',
      '0971924967',
      NULL,
      'venigna sanchez'
    ),
    (
      v_empresa_id,
      'Venus Maldonado',
      '0974240527',
      NULL,
      'venus maldonado'
    ),
    (
      v_empresa_id,
      'Venus Nunes',
      '0986883941',
      '1 selo (2)',
      'venus nunes'
    ),
    (
      v_empresa_id,
      'Venus Nunez',
      '0986883940',
      '20MIL',
      'venus nunez'
    ),
    (
      v_empresa_id,
      'Vera Balbuena',
      '0982105541',
      '10mil',
      'vera balbuena'
    ),
    (
      v_empresa_id,
      'Verinica Gimenez',
      '0973576243',
      NULL,
      'verinica gimenez'
    ),
    (
      v_empresa_id,
      'Veroni Ramirez',
      '0982617765',
      NULL,
      'veroni ramirez'
    ),
    (
      v_empresa_id,
      'Veronia Sora',
      '0992788626',
      NULL,
      'veronia sora'
    ),
    (
      v_empresa_id,
      'Veronica Alcaraz',
      '0982485050',
      '10MIL',
      'veronica alcaraz'
    ),
    (
      v_empresa_id,
      'Veronica Allo',
      '0981447447',
      NULL,
      'veronica allo'
    ),
    (
      v_empresa_id,
      'Veronica Amarilla',
      '0994592566',
      NULL,
      'veronica amarilla'
    ),
    (
      v_empresa_id,
      'Veronica Arevalos',
      '0992231992',
      NULL,
      'veronica arevalos'
    ),
    (
      v_empresa_id,
      'Veronica Arguello',
      '0961754262',
      NULL,
      'veronica arguello'
    ),
    (
      v_empresa_id,
      'Veronica Asfaduroff',
      '0971804406',
      '1 selo (2)',
      'veronica asfaduroff'
    ),
    (
      v_empresa_id,
      'Veronica Benitez',
      '0981159767',
      '1 selo (1)',
      'veronica benitez'
    ),
    (
      v_empresa_id,
      'Veronica Burgues',
      '0995685183',
      NULL,
      'veronica burgues'
    ),
    (
      v_empresa_id,
      'Veronica Cabrera',
      '0972433712',
      '10mil',
      'veronica cabrera'
    ),
    (
      v_empresa_id,
      'Veronica Caceres',
      '0991405811',
      NULL,
      'veronica caceres'
    ),
    (
      v_empresa_id,
      'Veronica Cuebas',
      '0994289475',
      NULL,
      'veronica cuebas'
    ),
    (
      v_empresa_id,
      'Veronica Di Leo',
      '0971967381',
      '10MIL',
      'veronica di leo'
    ),
    (
      v_empresa_id,
      'Veronica Escurra',
      '0983300873',
      NULL,
      'veronica escurra'
    ),
    (
      v_empresa_id,
      'Veronica Estigarribia',
      '0982889214',
      NULL,
      'veronica estigarribia'
    ),
    (
      v_empresa_id,
      'Veronica Flor',
      '0981283241',
      NULL,
      'veronica flor'
    ),
    (
      v_empresa_id,
      'Veronica Gimenez',
      '0971231889',
      '1 selo (1)',
      'veronica gimenez'
    ),
    (
      v_empresa_id,
      'Veronica Gomez',
      '0981131207',
      NULL,
      'veronica gomez'
    ),
    (
      v_empresa_id,
      'Veronica Gonzalez',
      '0992506602',
      '1 selo (4)',
      'veronica gonzalez'
    ),
    (
      v_empresa_id,
      'Veronica Hidalgo',
      '0981167225',
      NULL,
      'veronica hidalgo'
    ),
    (
      v_empresa_id,
      'Veronica Maciel',
      '0981236161',
      NULL,
      'veronica maciel'
    ),
    (
      v_empresa_id,
      'Veronica Mansur',
      '0981234144',
      NULL,
      'veronica mansur'
    ),
    (
      v_empresa_id,
      'Veronica Manzore',
      '0981234144',
      NULL,
      'veronica manzore'
    ),
    (
      v_empresa_id,
      'Veronica Manzur',
      '0981234144',
      NULL,
      'veronica manzur'
    ),
    (
      v_empresa_id,
      'Veronica Martinez',
      '0982632202',
      NULL,
      'veronica martinez'
    ),
    (
      v_empresa_id,
      'Veronica Medina',
      '0972137523',
      NULL,
      'veronica medina'
    ),
    (
      v_empresa_id,
      'Veronica Meister',
      '0986357368',
      NULL,
      'veronica meister'
    ),
    (
      v_empresa_id,
      'Veronica Mora',
      '0971333484',
      NULL,
      'veronica mora'
    ),
    (
      v_empresa_id,
      'Veronica Moreno',
      '0984561615',
      NULL,
      'veronica moreno'
    ),
    (
      v_empresa_id,
      'Veronica Morinigo',
      '0992291922',
      NULL,
      'veronica morinigo'
    ),
    (
      v_empresa_id,
      'Veronica nunes',
      '0971165525',
      NULL,
      'veronica nunes'
    ),
    (
      v_empresa_id,
      'Veronica Nunez',
      '0991200152',
      NULL,
      'veronica nunez'
    ),
    (
      v_empresa_id,
      'Veronica Ortiz',
      '0971875728',
      NULL,
      'veronica ortiz'
    ),
    (
      v_empresa_id,
      'Veronica Osorio',
      '0992788626',
      NULL,
      'veronica osorio'
    ),
    (
      v_empresa_id,
      'Veronica Paredes',
      '0983246683',
      NULL,
      'veronica paredes'
    ),
    (
      v_empresa_id,
      'Veronica Perez',
      '0981243311',
      NULL,
      'veronica perez'
    ),
    (
      v_empresa_id,
      'Veronica Pont',
      '0993266963',
      '30mil',
      'veronica pont'
    ),
    (
      v_empresa_id,
      'Veronica Quinhonez',
      '0981205902',
      '10MIL',
      'veronica quinhonez'
    ),
    (
      v_empresa_id,
      'Veronica Quinonez',
      '0971231889',
      NULL,
      'veronica quinonez'
    ),
    (
      v_empresa_id,
      'Veronica Reyes',
      '0995697690',
      NULL,
      'veronica reyes'
    ),
    (
      v_empresa_id,
      'Veronica Rodriguez',
      '0971888977',
      NULL,
      'veronica rodriguez'
    ),
    (
      v_empresa_id,
      'Veronica Ruiz',
      '0971685279',
      NULL,
      'veronica ruiz'
    ),
    (
      v_empresa_id,
      'Veronica Santacruz',
      '0982934609',
      NULL,
      'veronica santacruz'
    ),
    (
      v_empresa_id,
      'Veronica Sosa',
      '0981808134',
      NULL,
      'veronica sosa'
    ),
    (
      v_empresa_id,
      'Veronica Valdez',
      '0994358963',
      NULL,
      'veronica valdez'
    ),
    (
      v_empresa_id,
      'Veronica Vargas',
      '0993591001',
      NULL,
      'veronica vargas'
    ),
    (
      v_empresa_id,
      'Veronica Velazquez',
      '0983256228',
      NULL,
      'veronica velazquez'
    ),
    (
      v_empresa_id,
      'Veronica Vera',
      '0994718716',
      NULL,
      'veronica vera'
    ),
    (
      v_empresa_id,
      'Veronica Villalba',
      '0981660532',
      NULL,
      'veronica villalba'
    ),
    (
      v_empresa_id,
      'Vicente Avalos',
      NULL,
      NULL,
      'vicente avalos'
    ),
    (
      v_empresa_id,
      'Vicente Lezcano',
      '0994903065',
      '50mil',
      'vicente lezcano'
    ),
    (
      v_empresa_id,
      'Vicente Miguel Isas',
      '0981867864',
      NULL,
      'vicente miguel isas'
    ),
    (
      v_empresa_id,
      'Victor Armada',
      '0984338629',
      NULL,
      'victor armada'
    ),
    (
      v_empresa_id,
      'Victor Casan',
      '0994242500',
      '10mil',
      'victor casan'
    ),
    (
      v_empresa_id,
      'Victor Franco',
      '0971530997',
      NULL,
      'victor franco'
    ),
    (
      v_empresa_id,
      'Victor Goetz',
      '0994244238',
      NULL,
      'victor goetz'
    ),
    (
      v_empresa_id,
      'Victor Mora',
      '0983423406',
      '10mil',
      'victor mora'
    ),
    (
      v_empresa_id,
      'Victor Rodriguez',
      '0981542084',
      '20mil',
      'victor rodriguez'
    ),
    (
      v_empresa_id,
      'Victor Sandoval',
      '0972656451',
      '1 selo (2)',
      'victor sandoval'
    ),
    (
      v_empresa_id,
      'Victor Silva',
      '0991918189',
      NULL,
      'victor silva'
    ),
    (
      v_empresa_id,
      'Victor Villalba',
      '0984191361',
      NULL,
      'victor villalba'
    ),
    (
      v_empresa_id,
      'Victoria Benitez',
      '0983481432',
      NULL,
      'victoria benitez'
    ),
    (
      v_empresa_id,
      'Victoria Bogado',
      '0983733976',
      NULL,
      'victoria bogado'
    ),
    (
      v_empresa_id,
      'Victoria daporta',
      '0985819865',
      '20MIL',
      'victoria daporta'
    ),
    (
      v_empresa_id,
      'Victoria del Puerto',
      '0985819865',
      NULL,
      'victoria del puerto'
    ),
    (
      v_empresa_id,
      'Victoria Iriali',
      '0972567086',
      NULL,
      'victoria iriali'
    ),
    (
      v_empresa_id,
      'Victoria Mazacotte',
      '0961928572',
      '30mil',
      'victoria mazacotte'
    ),
    (
      v_empresa_id,
      'Victoria Perez',
      '0984332291',
      '20MIL',
      'victoria perez'
    ),
    (
      v_empresa_id,
      'Victoria Rojas',
      '0971656942',
      NULL,
      'victoria rojas'
    ),
    (
      v_empresa_id,
      'Victoria Torres',
      '0991999227',
      NULL,
      'victoria torres'
    ),
    (
      v_empresa_id,
      'Victpria Ortellado',
      '0983616175',
      NULL,
      'victpria ortellado'
    ),
    (
      v_empresa_id,
      'Vilma Figueredo',
      '0992969999',
      NULL,
      'vilma figueredo'
    ),
    (
      v_empresa_id,
      'Vilma Morales',
      '0981400436',
      NULL,
      'vilma morales'
    ),
    (
      v_empresa_id,
      'Violeta Bareiro',
      '0971869329',
      NULL,
      'violeta bareiro'
    ),
    (
      v_empresa_id,
      'Violeta Cristaldo',
      '0994975163',
      '10mil',
      'violeta cristaldo'
    ),
    (
      v_empresa_id,
      'Violeta Escobar',
      '0975156307',
      NULL,
      'violeta escobar'
    ),
    (
      v_empresa_id,
      'Violeta Keiros',
      '0991717026',
      NULL,
      'violeta keiros'
    ),
    (
      v_empresa_id,
      'Violeta Queiros',
      '0991717026',
      NULL,
      'violeta queiros'
    ),
    (
      v_empresa_id,
      'Virginia',
      NULL,
      NULL,
      'virginia'
    ),
    (
      v_empresa_id,
      'Virginia Gomez',
      '0962165532',
      '20mil',
      'virginia gomez'
    ),
    (
      v_empresa_id,
      'Virginia Gonzalez',
      '0987119773',
      NULL,
      'virginia gonzalez'
    ),
    (
      v_empresa_id,
      'Virginia Grau',
      '9871627839',
      NULL,
      'virginia grau'
    ),
    (
      v_empresa_id,
      'Virginia Sanabria',
      '0991830442',
      NULL,
      'virginia sanabria'
    ),
    (
      v_empresa_id,
      'Virginia Villalba',
      '0981603144',
      NULL,
      'virginia villalba'
    ),
    (
      v_empresa_id,
      'Vivi rojas',
      '0992268753',
      NULL,
      'vivi rojas'
    ),
    (
      v_empresa_id,
      'Vivian Barreto',
      '0974515242',
      NULL,
      'vivian barreto'
    ),
    (
      v_empresa_id,
      'Vivian Centurion',
      '0974103563',
      NULL,
      'vivian centurion'
    ),
    (
      v_empresa_id,
      'Vivian Esquuvel',
      '0984465993',
      NULL,
      'vivian esquuvel'
    ),
    (
      v_empresa_id,
      'Vivian Martinez',
      '0991978445',
      NULL,
      'vivian martinez'
    ),
    (
      v_empresa_id,
      'Vivian Ponte',
      '0986660770',
      NULL,
      'vivian ponte'
    ),
    (
      v_empresa_id,
      'Vivian Vesken',
      '0994842964',
      NULL,
      'vivian vesken'
    ),
    (
      v_empresa_id,
      'Viviana Allen',
      '0991411541',
      NULL,
      'viviana allen'
    ),
    (
      v_empresa_id,
      'Viviana Arietti',
      '0981205092',
      '1 selo (2)',
      'viviana arietti'
    ),
    (
      v_empresa_id,
      'Viviana Benitez',
      '0981630685',
      NULL,
      'viviana benitez'
    ),
    (
      v_empresa_id,
      'Viviana Cantero',
      '0981226052',
      NULL,
      'viviana cantero'
    ),
    (
      v_empresa_id,
      'Viviana Chamorro',
      '0985837805',
      NULL,
      'viviana chamorro'
    ),
    (
      v_empresa_id,
      'Viviana Cuencas',
      '0975979221',
      NULL,
      'viviana cuencas'
    ),
    (
      v_empresa_id,
      'Viviana Delgado',
      '0972515037',
      NULL,
      'viviana delgado'
    ),
    (
      v_empresa_id,
      'Viviana Espinosa',
      '0981287819',
      NULL,
      'viviana espinosa'
    ),
    (
      v_empresa_id,
      'Viviana gallo',
      '0981425130',
      '10mil',
      'viviana gallo'
    ),
    (
      v_empresa_id,
      'Viviana Gauto',
      '0971663361',
      NULL,
      'viviana gauto'
    ),
    (
      v_empresa_id,
      'Viviana Gonzalez',
      '0981443646',
      '10mil',
      'viviana gonzalez'
    ),
    (
      v_empresa_id,
      'Viviana Houdin',
      '0981847798',
      NULL,
      'viviana houdin'
    ),
    (
      v_empresa_id,
      'Viviana Medina',
      '0972780111',
      NULL,
      'viviana medina'
    ),
    (
      v_empresa_id,
      'Viviana Monzon',
      '0981343442',
      '20 mil',
      'viviana monzon'
    ),
    (
      v_empresa_id,
      'Viviana nunes',
      '0981164430',
      NULL,
      'viviana nunes'
    ),
    (
      v_empresa_id,
      'Viviana Ortellado',
      '0981863523',
      NULL,
      'viviana ortellado'
    ),
    (
      v_empresa_id,
      'Viviana Peralt',
      '0984468567',
      NULL,
      'viviana peralt'
    ),
    (
      v_empresa_id,
      'Viviana Pintos',
      '0981310314',
      NULL,
      'viviana pintos'
    ),
    (
      v_empresa_id,
      'Viviana Rolon',
      '0986397211',
      '1 selo (1)',
      'viviana rolon'
    ),
    (
      v_empresa_id,
      'Viviana Romero',
      '0972223598',
      NULL,
      'viviana romero'
    ),
    (
      v_empresa_id,
      'Viviana Vittore',
      '0972920701',
      NULL,
      'viviana vittore'
    ),
    (
      v_empresa_id,
      'Viviana Von Lucken',
      '0994442281',
      NULL,
      'viviana von lucken'
    ),
    (
      v_empresa_id,
      'Vivianna Alcaraz',
      '0972580070',
      NULL,
      'vivianna alcaraz'
    ),
    (
      v_empresa_id,
      'Walter Almeida',
      '0983806306',
      NULL,
      'walter almeida'
    ),
    (
      v_empresa_id,
      'Walter Guillen',
      '0982294021',
      NULL,
      'walter guillen'
    ),
    (
      v_empresa_id,
      'Walter Meza',
      '0976116897',
      NULL,
      'walter meza'
    ),
    (
      v_empresa_id,
      'Wendy Amarilla',
      '0961313080',
      NULL,
      'wendy amarilla'
    ),
    (
      v_empresa_id,
      'Wendy Aranda',
      '0992691852',
      NULL,
      'wendy aranda'
    ),
    (
      v_empresa_id,
      'Wendy Gonzalez',
      '0981548792',
      NULL,
      'wendy gonzalez'
    ),
    (
      v_empresa_id,
      'Wilfrido Preimanis',
      '0987334450',
      NULL,
      'wilfrido preimanis'
    ),
    (
      v_empresa_id,
      'Wilfridos Ocampos',
      '0982720828',
      NULL,
      'wilfridos ocampos'
    ),
    (
      v_empresa_id,
      'Wiliam Perez',
      '0984930812',
      '20mil',
      'wiliam perez'
    ),
    (
      v_empresa_id,
      'Wiliam Salinas',
      '0993334248',
      '10mil',
      'wiliam salinas'
    ),
    (
      v_empresa_id,
      'Willie Heinrichs',
      '0975769055',
      NULL,
      'willie heinrichs'
    ),
    (
      v_empresa_id,
      'Wilma Alarcon',
      '0983172713',
      NULL,
      'wilma alarcon'
    ),
    (
      v_empresa_id,
      'Wilma Canete',
      '0971379333',
      NULL,
      'wilma canete'
    ),
    (
      v_empresa_id,
      'Wilma Paiba',
      '0986229104',
      '20milo',
      'wilma paiba'
    ),
    (
      v_empresa_id,
      'Wilson Barrientos',
      '0991233460',
      NULL,
      'wilson barrientos'
    ),
    (
      v_empresa_id,
      'Wilson Paez',
      '0983850137',
      NULL,
      'wilson paez'
    ),
    (
      v_empresa_id,
      'Wilson Villagra',
      '0975914684',
      NULL,
      'wilson villagra'
    ),
    (
      v_empresa_id,
      'Ximena Alfonso',
      '0991705136',
      NULL,
      'ximena alfonso'
    ),
    (
      v_empresa_id,
      'Ximena Espinola',
      '0984683002',
      NULL,
      'ximena espinola'
    ),
    (
      v_empresa_id,
      'Ximena Fernandez',
      '0983060159',
      NULL,
      'ximena fernandez'
    ),
    (
      v_empresa_id,
      'Ximena Garcete',
      '0991807704',
      '20MIL',
      'ximena garcete'
    ),
    (
      v_empresa_id,
      'Ximena Pinedo',
      '0981602227',
      NULL,
      'ximena pinedo'
    ),
    (
      v_empresa_id,
      'Xioana Gomez',
      '0972239544',
      NULL,
      'xioana gomez'
    ),
    (
      v_empresa_id,
      'Xoana Gomez',
      '0972239544',
      NULL,
      'xoana gomez'
    ),
    (
      v_empresa_id,
      'Yadira Ayala',
      '0981615631',
      NULL,
      'yadira ayala'
    ),
    (
      v_empresa_id,
      'Yadira Formigni',
      '0985368411',
      NULL,
      'yadira formigni'
    ),
    (
      v_empresa_id,
      'Yadira Morinigo',
      '0981350340',
      NULL,
      'yadira morinigo'
    ),
    (
      v_empresa_id,
      'Yami Zarate',
      '0974606713',
      NULL,
      'yami zarate'
    ),
    (
      v_empresa_id,
      'Yamil Insaurralde',
      '0972155122',
      NULL,
      'yamil insaurralde'
    ),
    (
      v_empresa_id,
      'Yamila Aris',
      '0982917452',
      NULL,
      'yamila aris'
    ),
    (
      v_empresa_id,
      'Yamila Barrios',
      '0982441174',
      NULL,
      'yamila barrios'
    ),
    (
      v_empresa_id,
      'Yamila Cuellar',
      '0987216253',
      '1 selo (4)',
      'yamila cuellar'
    ),
    (
      v_empresa_id,
      'Yamila Decclesiis',
      '0976422153',
      '30mil',
      'yamila decclesiis'
    ),
    (
      v_empresa_id,
      'Yamila Franco',
      '0983017117',
      NULL,
      'yamila franco'
    ),
    (
      v_empresa_id,
      'Yamila Galeano',
      '0972637266',
      NULL,
      'yamila galeano'
    ),
    (
      v_empresa_id,
      'Yamila Jara',
      '0992654325',
      NULL,
      'yamila jara'
    ),
    (
      v_empresa_id,
      'Yamila Patino',
      '0981396095',
      NULL,
      'yamila patino'
    ),
    (
      v_empresa_id,
      'Yamila Valleau',
      '0971644026',
      NULL,
      'yamila valleau'
    ),
    (
      v_empresa_id,
      'Yamile Amarilla',
      '0971212833',
      NULL,
      'yamile amarilla'
    ),
    (
      v_empresa_id,
      'Yamile Benitez',
      '0981616231',
      NULL,
      'yamile benitez'
    ),
    (
      v_empresa_id,
      'Yamile Soler',
      '0986664034',
      NULL,
      'yamile soler'
    ),
    (
      v_empresa_id,
      'Yamilet Torres',
      '0982589864',
      NULL,
      'yamilet torres'
    ),
    (
      v_empresa_id,
      'Yamilet Zarza',
      '0992914857',
      NULL,
      'yamilet zarza'
    ),
    (
      v_empresa_id,
      'Yamileth Zarza',
      '0992914857',
      NULL,
      'yamileth zarza'
    ),
    (
      v_empresa_id,
      'Yamili Saana',
      '0981995550',
      NULL,
      'yamili saana'
    ),
    (
      v_empresa_id,
      'Yamyla Gonzalez',
      '0992556140',
      NULL,
      'yamyla gonzalez'
    ),
    (
      v_empresa_id,
      'Yana Aguero',
      '0981405836',
      NULL,
      'yana aguero'
    ),
    (
      v_empresa_id,
      'Yanela Valdez',
      '0974282938',
      NULL,
      'yanela valdez'
    ),
    (
      v_empresa_id,
      'Yaneli Ramirez',
      '0971143301',
      NULL,
      'yaneli ramirez'
    ),
    (
      v_empresa_id,
      'Yanet Santoner',
      '0984464692',
      NULL,
      'yanet santoner'
    ),
    (
      v_empresa_id,
      'Yang Hyejin',
      NULL,
      NULL,
      'yang hyejin'
    ),
    (
      v_empresa_id,
      'Yani Coronel',
      '0994711150',
      NULL,
      'yani coronel'
    ),
    (
      v_empresa_id,
      'Yanica Martinez',
      '0981110567',
      '30mil',
      'yanica martinez'
    ),
    (
      v_empresa_id,
      'Yanina Aguero',
      '0981909644',
      '1 selo (1)',
      'yanina aguero'
    ),
    (
      v_empresa_id,
      'Yanina Alcaraz',
      '0971396655',
      '10mil',
      'yanina alcaraz'
    ),
    (
      v_empresa_id,
      'Yanina Amarilla',
      '0991193401',
      NULL,
      'yanina amarilla'
    ),
    (
      v_empresa_id,
      'Yanina Aquino',
      '0974274264',
      NULL,
      'yanina aquino'
    ),
    (
      v_empresa_id,
      'Yanina Araujo',
      '0991348796',
      NULL,
      'yanina araujo'
    ),
    (
      v_empresa_id,
      'Yanina Ayala',
      '0982590559',
      '1 selo (1)',
      'yanina ayala'
    ),
    (
      v_empresa_id,
      'Yanina Basan',
      '0991816683',
      NULL,
      'yanina basan'
    ),
    (
      v_empresa_id,
      'Yanina Burgos',
      '0986131791',
      NULL,
      'yanina burgos'
    ),
    (
      v_empresa_id,
      'Yanina Cristaldo',
      '0981371556',
      NULL,
      'yanina cristaldo'
    ),
    (
      v_empresa_id,
      'Yanina Diaz',
      '99352226',
      NULL,
      'yanina diaz'
    ),
    (
      v_empresa_id,
      'Yanina Duarte',
      '0992399532',
      '60mil',
      'yanina duarte'
    ),
    (
      v_empresa_id,
      'Yanina Espinoza',
      '0973869294',
      NULL,
      'yanina espinoza'
    ),
    (
      v_empresa_id,
      'Yanina Firgrroji',
      '0971789092',
      '1 selo (1)',
      'yanina firgrroji'
    ),
    (
      v_empresa_id,
      'Yanina Garcerte',
      '0972860381',
      NULL,
      'yanina garcerte'
    ),
    (
      v_empresa_id,
      'Yanina Garcete',
      '0971252620',
      NULL,
      'yanina garcete'
    ),
    (
      v_empresa_id,
      'Yanina Gimenez',
      '0981723542',
      '10mil',
      'yanina gimenez'
    ),
    (
      v_empresa_id,
      'Yanina Livio',
      '0994150981',
      NULL,
      'yanina livio'
    ),
    (
      v_empresa_id,
      'Yanina Lovero',
      '0994487227',
      NULL,
      'yanina lovero'
    ),
    (
      v_empresa_id,
      'Yanina Mendieta',
      '0974597153',
      NULL,
      'yanina mendieta'
    ),
    (
      v_empresa_id,
      'Yanina Monjes',
      '0982874518',
      NULL,
      'yanina monjes'
    ),
    (
      v_empresa_id,
      'Yanina Ortiz',
      '0985673221',
      '60mil',
      'yanina ortiz'
    ),
    (
      v_empresa_id,
      'Yanina Portillo',
      '0961998855',
      NULL,
      'yanina portillo'
    ),
    (
      v_empresa_id,
      'Yanina Quintana',
      '0992562506',
      '10MIL',
      'yanina quintana'
    ),
    (
      v_empresa_id,
      'Yanina Ramos',
      '0972109008',
      NULL,
      'yanina ramos'
    ),
    (
      v_empresa_id,
      'Yanina Risso',
      '0992292040',
      NULL,
      'yanina risso'
    ),
    (
      v_empresa_id,
      'Yanina Romero',
      '0982294862',
      '10MIL',
      'yanina romero'
    ),
    (
      v_empresa_id,
      'Yanina Servin',
      '0981653570',
      NULL,
      'yanina servin'
    ),
    (
      v_empresa_id,
      'Yanina Silva',
      '0971617931',
      NULL,
      'yanina silva'
    ),
    (
      v_empresa_id,
      'Yanina Stehlik',
      '0994109318',
      NULL,
      'yanina stehlik'
    ),
    (
      v_empresa_id,
      'Yanina Torres',
      NULL,
      NULL,
      'yanina torres'
    ),
    (
      v_empresa_id,
      'Yanina Unzain',
      '0984755360',
      NULL,
      'yanina unzain'
    ),
    (
      v_empresa_id,
      'Yanina Venialgo',
      '0982938802',
      NULL,
      'yanina venialgo'
    ),
    (
      v_empresa_id,
      'Yanina Vera',
      '0972848895',
      NULL,
      'yanina vera'
    ),
    (
      v_empresa_id,
      'Yanina Viera',
      '0983417744',
      NULL,
      'yanina viera'
    ),
    (
      v_empresa_id,
      'Yanina Villalba',
      '0984954972',
      NULL,
      'yanina villalba'
    ),
    (
      v_empresa_id,
      'Yanina Zarate',
      '0994459068',
      NULL,
      'yanina zarate'
    ),
    (
      v_empresa_id,
      'Yanizze Rozzano',
      '0972152939',
      NULL,
      'yanizze rozzano'
    ),
    (
      v_empresa_id,
      'Yannina Gomez',
      '0971777568',
      NULL,
      'yannina gomez'
    ),
    (
      v_empresa_id,
      'Yaquelin Martinez',
      NULL,
      NULL,
      'yaquelin martinez'
    ),
    (
      v_empresa_id,
      'Yehudi Recalde',
      '0984658154',
      NULL,
      'yehudi recalde'
    ),
    (
      v_empresa_id,
      'Yeimy Gomez',
      '0983268285',
      NULL,
      'yeimy gomez'
    ),
    (
      v_empresa_id,
      'Yeisa Gimenez',
      '0981063083',
      NULL,
      'yeisa gimenez'
    ),
    (
      v_empresa_id,
      'Yelsy Bogarin',
      '0985525801',
      NULL,
      'yelsy bogarin'
    ),
    (
      v_empresa_id,
      'Yeni Balenzano',
      '0991717110',
      '50mil',
      'yeni balenzano'
    ),
    (
      v_empresa_id,
      'Yeni Cabral',
      '0984210231',
      '30mil',
      'yeni cabral'
    ),
    (
      v_empresa_id,
      'Yeni Rodriguez',
      '0984514750',
      NULL,
      'yeni rodriguez'
    ),
    (
      v_empresa_id,
      'Yeni Rojas',
      NULL,
      NULL,
      'yeni rojas'
    ),
    (
      v_empresa_id,
      'Yeni Vera',
      '0981606797',
      NULL,
      'yeni vera'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Chunk 12: filas 5501..5574
  WITH nuevos AS (
    INSERT INTO pronimerp.clientes (empresa_id, nombre, telefono, tipo_cliente, estado, created_at)
    SELECT v.empresa_id, v.nombre, v.telefono,
           CASE WHEN v.vip IS NOT NULL AND v.vip <> '' THEN 'vip' ELSE 'particular' END,
           'activo',
           now()
    FROM (VALUES
      (
      v_empresa_id,
      'Yenifer Acosta',
      '0991546130',
      NULL,
      'yenifer acosta'
    ),
    (
      v_empresa_id,
      'Yenifer Cabral',
      '0984210231',
      NULL,
      'yenifer cabral'
    ),
    (
      v_empresa_id,
      'Yenifer Canete',
      '0976597996',
      NULL,
      'yenifer canete'
    ),
    (
      v_empresa_id,
      'Yenifer Heinrichs',
      '0972604462',
      '60mill',
      'yenifer heinrichs'
    ),
    (
      v_empresa_id,
      'Yenifer Leguizamon',
      NULL,
      NULL,
      'yenifer leguizamon'
    ),
    (
      v_empresa_id,
      'Yenifer Perez',
      '0981808726',
      NULL,
      'yenifer perez'
    ),
    (
      v_empresa_id,
      'Yenni Cabral',
      '0986888887',
      NULL,
      'yenni cabral'
    ),
    (
      v_empresa_id,
      'Yennifer Oviedo',
      '0986442907',
      NULL,
      'yennifer oviedo'
    ),
    (
      v_empresa_id,
      'Yenny Duarte',
      '0981656308',
      NULL,
      'yenny duarte'
    ),
    (
      v_empresa_id,
      'Yenny Gomez',
      '0992958674',
      '10mil',
      'yenny gomez'
    ),
    (
      v_empresa_id,
      'Yenny Lezcano',
      '9994284132',
      NULL,
      'yenny lezcano'
    ),
    (
      v_empresa_id,
      'Yeny Zallas',
      '0971505001',
      NULL,
      'yeny zallas'
    ),
    (
      v_empresa_id,
      'Yeruti Alfonso',
      '0984855899',
      NULL,
      'yeruti alfonso'
    ),
    (
      v_empresa_id,
      'Yesenia Centurion',
      '0984820347',
      '30mil',
      'yesenia centurion'
    ),
    (
      v_empresa_id,
      'Yessica Araujo',
      '0985441301',
      NULL,
      'yessica araujo'
    ),
    (
      v_empresa_id,
      'Yessica Bernal',
      '0986483020',
      NULL,
      'yessica bernal'
    ),
    (
      v_empresa_id,
      'Yessica Correa',
      '0986555263',
      NULL,
      'yessica correa'
    ),
    (
      v_empresa_id,
      'Yessica Diaz',
      '0982860204',
      NULL,
      'yessica diaz'
    ),
    (
      v_empresa_id,
      'Yessica Gamarra',
      '0983194007',
      NULL,
      'yessica gamarra'
    ),
    (
      v_empresa_id,
      'Yessica Garza',
      '0981417408',
      NULL,
      'yessica garza'
    ),
    (
      v_empresa_id,
      'Yessica Gimenez',
      '0985336931',
      NULL,
      'yessica gimenez'
    ),
    (
      v_empresa_id,
      'Yessica Gonzalez',
      '0991284005',
      NULL,
      'yessica gonzalez'
    ),
    (
      v_empresa_id,
      'Yessica Lopez',
      '0995699994',
      NULL,
      'yessica lopez'
    ),
    (
      v_empresa_id,
      'Yessica Olmedo',
      '0961502478',
      NULL,
      'yessica olmedo'
    ),
    (
      v_empresa_id,
      'Yessica Rojas',
      '9714337265',
      NULL,
      'yessica rojas'
    ),
    (
      v_empresa_id,
      'Yessica Rolandi',
      '0991735751',
      NULL,
      'yessica rolandi'
    ),
    (
      v_empresa_id,
      'Yessica Vargas',
      '0991279644',
      NULL,
      'yessica vargas'
    ),
    (
      v_empresa_id,
      'Yessyca Gimenez',
      '0985336931',
      NULL,
      'yessyca gimenez'
    ),
    (
      v_empresa_id,
      'Yigliola Dalgis',
      '0994745199',
      NULL,
      'yigliola dalgis'
    ),
    (
      v_empresa_id,
      'Yilmar Duarte',
      '0976810540',
      NULL,
      'yilmar duarte'
    ),
    (
      v_empresa_id,
      'Yini Meza',
      '0994359086',
      NULL,
      'yini meza'
    ),
    (
      v_empresa_id,
      'Yisela Troche',
      NULL,
      NULL,
      'yisela troche'
    ),
    (
      v_empresa_id,
      'Yisenia Ramirez',
      '0986437370',
      NULL,
      'yisenia ramirez'
    ),
    (
      v_empresa_id,
      'ylsen Ramirez',
      '0982540812',
      NULL,
      'ylsen ramirez'
    ),
    (
      v_empresa_id,
      'Yohan Dior',
      '0991401526',
      NULL,
      'yohan dior'
    ),
    (
      v_empresa_id,
      'Yohana Baldoza',
      '0981888218',
      '10mil',
      'yohana baldoza'
    ),
    (
      v_empresa_id,
      'Yohana Barboza',
      '0981888218',
      NULL,
      'yohana barboza'
    ),
    (
      v_empresa_id,
      'Yohana Esquivel',
      '0994790812',
      NULL,
      'yohana esquivel'
    ),
    (
      v_empresa_id,
      'Yohana Ruiz Diaz',
      '0971144642',
      NULL,
      'yohana ruiz diaz'
    ),
    (
      v_empresa_id,
      'Yohana Wall',
      '0982699637',
      NULL,
      'yohana wall'
    ),
    (
      v_empresa_id,
      'Yolanda Avila',
      '0994818798',
      '1 selo (3)',
      'yolanda avila'
    ),
    (
      v_empresa_id,
      'Yolanda Oviedo',
      '0971984677',
      NULL,
      'yolanda oviedo'
    ),
    (
      v_empresa_id,
      'Yoselin Vaualdo',
      '0981727324',
      NULL,
      'yoselin vaualdo'
    ),
    (
      v_empresa_id,
      'Ysabel Machado',
      '0984831717',
      NULL,
      'ysabel machado'
    ),
    (
      v_empresa_id,
      'Yudit Garcete',
      '0986464607',
      NULL,
      'yudit garcete'
    ),
    (
      v_empresa_id,
      'Yuli',
      NULL,
      NULL,
      'yuli'
    ),
    (
      v_empresa_id,
      'Yvelis Gonzalez',
      '0983495026',
      '10mil',
      'yvelis gonzalez'
    ),
    (
      v_empresa_id,
      'Zaira Sandoval',
      '0993549462',
      NULL,
      'zaira sandoval'
    ),
    (
      v_empresa_id,
      'Zaira Zandoval',
      '0994549462',
      NULL,
      'zaira zandoval'
    ),
    (
      v_empresa_id,
      'Zamira Marquez',
      '0985878031',
      NULL,
      'zamira marquez'
    ),
    (
      v_empresa_id,
      'Zara Aguero',
      '0986904681',
      NULL,
      'zara aguero'
    ),
    (
      v_empresa_id,
      'Zara Oses',
      '0985327722',
      NULL,
      'zara oses'
    ),
    (
      v_empresa_id,
      'Zibele Chiattone',
      '0994716754',
      NULL,
      'zibele chiattone'
    ),
    (
      v_empresa_id,
      'Zoe Perez',
      '0985658549',
      '20mil',
      'zoe perez'
    ),
    (
      v_empresa_id,
      'Zonia Portillo',
      '0973893793',
      NULL,
      'zonia portillo'
    ),
    (
      v_empresa_id,
      'Zoraida De Montanholi',
      '9719986351',
      NULL,
      'zoraida de montanholi'
    ),
    (
      v_empresa_id,
      'Zoraya Chamorro',
      '0981260251',
      NULL,
      'zoraya chamorro'
    ),
    (
      v_empresa_id,
      'Zulma Cohene',
      '0991822011',
      NULL,
      'zulma cohene'
    ),
    (
      v_empresa_id,
      'Zulma Coronel',
      '0972134095',
      NULL,
      'zulma coronel'
    ),
    (
      v_empresa_id,
      'Zulma Ortigoza',
      '0991865696',
      NULL,
      'zulma ortigoza'
    ),
    (
      v_empresa_id,
      'Zulma Pineda',
      '0961883317',
      NULL,
      'zulma pineda'
    ),
    (
      v_empresa_id,
      'Zulma Rojas',
      '0981205826',
      NULL,
      'zulma rojas'
    ),
    (
      v_empresa_id,
      'Zuni',
      NULL,
      NULL,
      'zuni'
    ),
    (
      v_empresa_id,
      'Zuni Ortega',
      '0991720047',
      NULL,
      'zuni ortega'
    ),
    (
      v_empresa_id,
      'Zunilda Cabral',
      '0981868761',
      NULL,
      'zunilda cabral'
    ),
    (
      v_empresa_id,
      'Zunilda Caceres',
      '0991850972',
      NULL,
      'zunilda caceres'
    ),
    (
      v_empresa_id,
      'Zunilda Dasilba',
      '9859202118',
      NULL,
      'zunilda dasilba'
    ),
    (
      v_empresa_id,
      'Zunilda Franco',
      '0984201216',
      NULL,
      'zunilda franco'
    ),
    (
      v_empresa_id,
      'Zunilda Gonzalez',
      '0982944855',
      NULL,
      'zunilda gonzalez'
    ),
    (
      v_empresa_id,
      'Zunilda Prieto',
      '0975774655',
      '20mil',
      'zunilda prieto'
    ),
    (
      v_empresa_id,
      'Zunilda Ramirez',
      '0976820669',
      NULL,
      'zunilda ramirez'
    ),
    (
      v_empresa_id,
      'Zunilda Roa',
      '0982994134',
      NULL,
      'zunilda roa'
    ),
    (
      v_empresa_id,
      'Zunilda Vazquez',
      '0984324162',
      '10mil',
      'zunilda vazquez'
    ),
    (
      v_empresa_id,
      'Zuralda rojas',
      '0972384972',
      NULL,
      'zuralda rojas'
    )
    ) AS v(empresa_id, nombre, telefono, vip, nombre_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pronimerp.clientes c
      WHERE c.empresa_id = v_empresa_id
        AND lower(trim(c.nombre)) = v.nombre_key
    )
    RETURNING id, lower(trim(nombre)) AS nombre_key
  )
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT n.nombre_key, n.id, 0 FROM nuevos n
  ON CONFLICT DO NOTHING;


  -- Traer también clientes preexistentes que matchean por nombre (para poder
  -- registrarles créditos igual). Merge por nombre_key.
  INSERT INTO tmp_import_clientes (nombre_key, cliente_id, evaluaciones)
  SELECT lower(trim(c.nombre)), c.id, 0
  FROM pronimerp.clientes c
  WHERE c.empresa_id = v_empresa_id
  ON CONFLICT (nombre_key) DO NOTHING;

  -- Setear evaluaciones desde el mapa que sigue


  UPDATE tmp_import_clientes t
  SET evaluaciones = v.eval
  FROM (VALUES
    ('aadrian basedaeu', 22000),
    ('abel cardozo', 530000),
    ('abigail pinedo', 50000),
    ('abigail ramirez', 88000),
    ('abril arzamendia', 50000),
    ('ada aguilera', 90000),
    ('ada ayala', 40000),
    ('ada barua', 170000),
    ('adi barrios', 467000),
    ('adiana zarza', 25000),
    ('adraiana cabrera', 50000),
    ('adraiana gonzalez', 60000),
    ('adriana almada', 150000),
    ('adriana alviso', 100000),
    ('adriana bareiro', 140000),
    ('adriana ferreira', 500000),
    ('adriana galloso', 260000),
    ('adriana gimenez', 204000),
    ('adriana gomez', 280000),
    ('adriana gonzalez', 40000),
    ('adriana mendieta', 562000),
    ('adriana ortiz', 870000),
    ('adriana parza', 150000),
    ('adriana peralta', 170000),
    ('adriana rivas', 160000),
    ('adriana sanchez', 550000),
    ('adriana viveros', 870000),
    ('adriana zalazar', 230000),
    ('adriana zamudri', 110000),
    ('agata salinas', 100000),
    ('agogos', 108000),
    ('agustina bustos', 230000),
    ('agustina trinidad', 100000),
    ('aida curbalan', 400000),
    ('aida dominguez', 920000),
    ('aida figueredo', 180000),
    ('aida rojas', 50000),
    ('aida veloso', 49000),
    ('aide benitez', 48000),
    ('aide gomez', 190000),
    ('ailen vargas', 270000),
    ('alan gaston', 120000),
    ('alan parrientos', 360000),
    ('alana santacruz', 200000),
    ('alba ayala', 680000),
    ('alba benitez', 300000),
    ('alba rojas', 1066000),
    ('alba vera', 90000),
    ('alberta fernandez', 210000),
    ('albina oviedo', 100000),
    ('aldana cartelle', 300000),
    ('ale', 1242000),
    ('ale (bru)', 291000),
    ('ale bru', 408000),
    ('ale bruna', 785000),
    ('alejandra arcia', 180000),
    ('alejandra bareiro', 520000),
    ('alejandra barrios', 50000),
    ('alejandra galeano', 110000),
    ('alejandra garcia', 160000),
    ('alejandra lovera', 230000),
    ('alejandra martinez', 110000),
    ('alejandra medina', 680000),
    ('alejandra obrego', 150000),
    ('alejandra patina', 100000),
    ('alejandra ramos', 180000),
    ('alejandra valdez', 402000),
    ('alejandra vega ortiz', 510000),
    ('alejandra wrede', 330000),
    ('alejandro areco', 280000),
    ('aleli peralta', 340000),
    ('alessandra garcete', 230000),
    ('alexa benitez', 195000),
    ('alexandra acevedo', 390000),
    ('alexandra armadans', 500000),
    ('alexandra astorga', 110000),
    ('alexandra barreto', 70000),
    ('alexandra barrios', 110000),
    ('alexandra blanco', 70000),
    ('alexandra bogarin', 1913500),
    ('alexandra correa', 170000),
    ('alexandra felip', 270000),
    ('alexia diaz', 140000),
    ('alexia martinez', 360000),
    ('alexia spiess', 250000),
    ('alice cespedes', 1050000),
    ('alice ferreira', 260000),
    ('alicia arruello', 100000),
    ('alicia caballero', 70000),
    ('alicia escobar', 730000),
    ('alicia gonzalez', 310000),
    ('alicia saldivar', 60000),
    ('alicia vazquez', 380000),
    ('alicia vicesar', 160000),
    ('alida gamarra', 160000),
    ('aline britez', 140000),
    ('aline gapelatto', 40000),
    ('alisar zein', 400000),
    ('alison baez', 380000),
    ('alma castillo', 782500),
    ('alma ferreira', 200000),
    ('alma martinez', 50000),
    ('alma rodriguez', 310000),
    ('amanda mesa', 130000),
    ('amaya parodi', 200000),
    ('ambar arar', 500000),
    ('ambar isnardi', 300000),
    ('ambar ramirez', 70000),
    ('ana acuna', 1080000),
    ('ana alviso', 257000),
    ('ana amarilla', 180000),
    ('ana arias', 100000),
    ('ana ayala', 470000),
    ('ana belen garcete', 200000),
    ('ana bosch', 140000),
    ('ana caballero', 570000),
    ('ana cantero', 380000),
    ('ana colman', 60000),
    ('ana domaniczky', 70000),
    ('ana domaniski', 100000),
    ('ana domanisque', 320000),
    ('ana ferko', 290000),
    ('ana ferreira', 35000),
    ('ana gabriela', 210000),
    ('ana gabriela rautenberg', 1690000),
    ('ana galeano', 240000),
    ('ana garcete', 390000),
    ('ana gomez', 250000),
    ('ana gonzalez', 350000),
    ('ana jara', 200000),
    ('ana knust', 2757000),
    ('ana laura', 140000),
    ('ana lira', 240000),
    ('ana lopez', 470000),
    ('ana martinez', 280000),
    ('ana mendieta', 210000),
    ('ana miranda', 110000),
    ('ana moreno', 150000),
    ('ana paula', 540000),
    ('ana quintana', 270000),
    ('ana ramirez', 242000),
    ('ana rojas', 370000),
    ('ana salinas', 470000),
    ('ana victoria', 300000),
    ('ana villalba', 891000),
    ('anabella ortiz', 481000),
    ('anahi moreira', 361000),
    ('anahi ovelar', 60000),
    ('anahi rodriguez', 110000),
    ('anahi rojas', 250000),
    ('analia benitez', 330000),
    ('analia figueredo', 300000),
    ('analia galeano', 1000000),
    ('analia gomez', 529000),
    ('analia ojeda', 250000),
    ('analia ojeda vazquez', 170000),
    ('analia rojas', 800000),
    ('analia spina', 340000),
    ('analiz acosta', 160000),
    ('anastasia menezes', 100000),
    ('anayeli insfran', 320000),
    ('andra abila', 120000),
    ('andrea aguilera', 362000),
    ('andrea alberdi', 180000),
    ('andrea alcaraz', 140000),
    ('andrea alfonso', 630000),
    ('andrea amarilla', 950000),
    ('andrea benitez', 400000),
    ('andrea chavez', 80000),
    ('andrea dominguez', 76000),
    ('andrea duarte', 750000),
    ('andrea figari', 370000),
    ('andrea galeano', 120000),
    ('andrea garay', 340000),
    ('andrea gavilan', 240000),
    ('andrea gonzalez', 30000),
    ('andrea guerrero', 440000),
    ('andrea gutierrez', 120000),
    ('andrea manzur', 600000),
    ('andrea martinez', 200000),
    ('andrea portillo', 1150000),
    ('andrea quevedo', 60000),
    ('andrea roiss', 140000),
    ('andrea soler', 29000),
    ('andrea sosa', 600000),
    ('andrea udagawa', 120000),
    ('andrea velazquez', 550000),
    ('andrea villamayor', 1150000),
    ('andres lopez', 190000),
    ('andres vergara', 100000),
    ('andy esquivel', 325000),
    ('angela ayala', 200000),
    ('angela lugo', 280000),
    ('angela olmedo', 80000),
    ('angela riquelme', 300000),
    ('angeles espinola', 120000),
    ('angelica cegelnicki', 80000),
    ('angelica pando', 170000),
    ('angie alvarez', 190000),
    ('aninka ferreira', 100000),
    ('anita fernandez', 110000),
    ('antonela villasanti', 68000),
    ('antonella boselli', 290000),
    ('antonella cattoni', 210000),
    ('antonella cuenca', 90000),
    ('antonella diaz', 50000),
    ('antonella ducrot', 100000),
    ('antonella espinola', 100000),
    ('antonella gomez', 140000),
    ('antonella melgarejo', 120000),
    ('antonella mojoli', 110000),
    ('antonella yubero', 370000),
    ('antonia argana', 636000),
    ('antonia arganha', 220000),
    ('antonia baez', 50000),
    ('antonia dominguez', 216000),
    ('antonia gonzalez', 360000),
    ('antonia zotelo', 90000),
    ('antonio lopez rivas', 120000),
    ('ara catanas', 242000),
    ('ara garcete', 410000),
    ('ara jaime', 210000),
    ('araceli', 238000),
    ('araceli acosta', 80000),
    ('araceli aguilera', 220000),
    ('araceli aranda', 110000),
    ('araceli arrua', 130000),
    ('araceli barreto', 110000),
    ('araceli bineitez', 200000),
    ('araceli duarte', 210000),
    ('araceli galeano', 70000),
    ('araceli gonzalez', 220000),
    ('araceli lopez', 50000),
    ('araceli meza', 480000),
    ('araceli mnosalva', 430000),
    ('araceli molinari', 230000),
    ('araceli quintana', 100000),
    ('araceli sosa', 200000),
    ('araceli villalba', 600000),
    ('aracely fernandez', 190000),
    ('aracely gonzalez', 140000),
    ('aracely manosalva', 250000),
    ('aracely olmedo', 210000),
    ('arami arrua', 539000),
    ('arami benitez', 50000),
    ('arami dominguez', 90000),
    ('arami mendez', 670000),
    ('arami pereira', 300000),
    ('arami torres', 270000),
    ('arami vera', 80000),
    ('arete', 780500),
    ('arete monitos', 121300),
    ('aritos', 1010500),
    ('aritos bebe', 120000),
    ('aritos plata', 100000),
    ('aritos tassi y pulseras', 619000),
    ('arturo weiler', 110000),
    ('auda riveros', 280000),
    ('aura ramoa', 300000),
    ('aurelia mesa', 102000),
    ('auxiliadora sovala', 50000),
    ('ayelen gimenez', 70000),
    ('ayelen roman', 524000),
    ('ayelen suarez', 29000),
    ('azaria duarte', 710000),
    ('baberos bandana lyf', 1288000),
    ('baberos lyf', 336000),
    ('baberos lyf bandana', 448000),
    ('babuches', 7573500),
    ('barbara chamorro', 170000),
    ('barbara jimenez', 300000),
    ('beatriz duarte', 490000),
    ('beatriz escobar', 116000),
    ('beatriz genes', 80000),
    ('beatriz gerbrand', 270000),
    ('belen', 110000),
    ('belen acosta', 280000),
    ('belen almada', 320000),
    ('belen araujo', 90000),
    ('belen argana', 500000),
    ('belen avalos', 50000),
    ('belen baez', 100000),
    ('belen cabrera', 50000),
    ('belen cardozo', 200000),
    ('belen cristaldo', 800000),
    ('belen cubilla', 200000),
    ('belen echague', 100000),
    ('belen espinola', 99000),
    ('belen ferreira', 520000),
    ('belen flor', 420000),
    ('belen gaete', 420000),
    ('belen glitz', 110000),
    ('belen gomez', 854000),
    ('belen gonzalez rios', 620000),
    ('belen melgarejo', 130000),
    ('belen miranda', 450000),
    ('belen morinigo', 120000),
    ('belen nacimiento', 70000),
    ('belen nunez', 160000),
    ('belen orrego', 100000),
    ('belen palacios', 120000),
    ('belen paredes', 40000),
    ('belen pedrozo', 250000),
    ('belen pereira', 280000),
    ('belen pereria', 210000),
    ('belen ramirez', 1160000),
    ('belen riveros', 190000),
    ('belen saldivar', 100000),
    ('belen sanabria', 780000),
    ('belen torres', 210000),
    ('belen vaesken', 110000),
    ('belen vargas', 86000),
    ('belen zarate', 300000),
    ('benigna sanchez', 1000000),
    ('berenice vega', 410000),
    ('bernardo arrua', 70000),
    ('betania acosta', 40000),
    ('betania villagra', 150000),
    ('bethania alvarez', 385000),
    ('bethania chavez', 570000),
    ('bethania escobeiro', 360000),
    ('bethania perez', 160000),
    ('bethania prieto', 201000),
    ('bety aguero', 160000),
    ('bianca barrios', 2600000),
    ('bianca espinola', 215000),
    ('bianca ortega', 20000),
    ('bianca vega', 300000),
    ('bianca vera', 140000),
    ('blanca aquino', 310000),
    ('blanca garcete', 100000),
    ('blanca genez', 260000),
    ('blanca ortega', 100000),
    ('blanca sanchez', 40000),
    ('bobojacos y pijamas', 1092000),
    ('boddys', 2800000),
    ('body casa monica', 3500000),
    ('bodys bonanza', 2660000),
    ('bodys casa monica', 2030000),
    ('bodys monica', 2800000),
    ('branda florencial', 210000),
    ('brenda godoy', 110000),
    ('brenda gomez', 674000),
    ('brenda morel', 380000),
    ('brian fretes', 180000),
    ('brijida farinha', 100000),
    ('brisa di pardo', 690000),
    ('briza ayala', 50000),
    ('bruna ale', 532000),
    ('brunella ayala', 440000),
    ('buckets nena tienda', 112000),
    ('bufandas casa monica', 120000),
    ('c', 1100000),
    ('camila aguilar', 70000),
    ('camila amarilla', 240000),
    ('camila auad', 520000),
    ('camila aveiro', 250000),
    ('camila barrail', 760000),
    ('camila bogado', 700000),
    ('camila caballero', 740000),
    ('camila cardozo', 370000),
    ('camila chaparro', 180000),
    ('camila curtido', 150000),
    ('camila espinola', 710000),
    ('camila gimenez', 930000),
    ('camila ivarrola', 490000),
    ('camila lopez', 310000),
    ('camila mendoza', 50000),
    ('camila mieres', 181000),
    ('camila mora', 342000),
    ('camila neuui', 145000),
    ('camila ocampos', 102000),
    ('camila ortiz', 230000),
    ('camila ovaldo', 100000),
    ('camila pereira', 820000),
    ('camila rivas', 230000),
    ('camila roa', 120000),
    ('camila salinas', 40000),
    ('camila sol baby', 35801000),
    ('camila thonon', 260000),
    ('camila torres', 276000),
    ('camila vega', 1003000),
    ('camila vera', 100000),
    ('camila zapata', 170000),
    ('camilla vazquez', 1070000),
    ('candy osorio', 131000),
    ('carina martini', 180000),
    ('carla penayo', 170000),
    ('carlos ferreira', 1001000),
    ('carlos santacruz', 50000),
    ('carlos servin', 40000),
    ('carlos vazquez', 200000),
    ('carmen acosta', 90000),
    ('carmen arguello', 300000),
    ('carmen avalos', 300000),
    ('carmen bobadilla', 30000),
    ('carmen cabanas', 60000),
    ('carmen fernandez', 190000),
    ('carmen genez', 120000),
    ('carmen ibarra', 130000),
    ('carmen rojas', 860000),
    ('carmen torres', 100000),
    ('carmen vera', 1154000),
    ('carolina', 500000),
    ('carolina ibarra', 160000),
    ('carolina martinez', 150000),
    ('carolina pereira', 424000),
    ('casa angela', 486000),
    ('casa monica', 2100000),
    ('casa monica (bodys)', 1400000),
    ('casterina reyes', 202000),
    ('catalina estigarribia', 160000),
    ('catalina orrego', 189000),
    ('catia acosta', 310000),
    ('catia lopez', 190000),
    ('cecia caballero', 240000),
    ('cecilia araujo', 640000),
    ('cecilia azuca', 390000),
    ('cecilia barrios', 250000),
    ('cecilia espinoza', 50000),
    ('cecilia gonzalez', 260000),
    ('cecilia guerero', 340000),
    ('cecilia kim', 350000),
    ('cecilia mendoza', 80000),
    ('cecilia otazo', 130000),
    ('cecilia rrejala', 190000),
    ('cecilia sanabria', 210000),
    ('cecilia silvera', 60000),
    ('cecilia ubeda', 260000),
    ('cecilia vera', 420000),
    ('celeste florentin', 420000),
    ('celeste gimenez', 190000),
    ('celeste gonzalez', 290000),
    ('celeste irala', 180000),
    ('celeste rodas', 115000),
    ('celeste roig', 150000),
    ('celeste ruiz diaz', 370000),
    ('celia ayala', 290000),
    ('celia franco', 240000),
    ('celia gomez', 770000),
    ('celida gonzalez', 30000),
    ('charlotte dumoulin', 500000),
    ('cibele chiattone', 350000),
    ('cinthia benitez', 320000),
    ('cinthia cristaldo zarate', 1700000),
    ('cinthia escobar', 270000),
    ('cinthia iglesias', 250000),
    ('cinthia lopez', 220000),
    ('cinthia piedrabuena', 230000),
    ('cinthia rodriguez', 170000),
    ('cinthia rojas', 210000),
    ('cinthia sosa', 160000),
    ('cinthia zeballos', 170000),
    ('cinthya', 410000),
    ('cinthya basualdo', 120000),
    ('cinthya franco', 50000),
    ('cinthya sarabia', 180000),
    ('cithia lopez', 90000),
    ('cithia vera', 890000),
    ('clara acuna', 650000),
    ('clara alarcon', 990000),
    ('clara benitez', 260000),
    ('clara carvallo', 430000),
    ('clara gonzalez', 150000),
    ('clara rodas', 200000),
    ('clara solis', 40000),
    ('clara sotelo', 40000),
    ('claudelina chavez', 270000),
    ('claudia', 350000),
    ('claudia baezque', 1162000),
    ('claudia benitez', 120000),
    ('claudia britez', 40000),
    ('claudia caceres', 1500000),
    ('claudia cespedes', 580000),
    ('claudia davalos', 140000),
    ('claudia gomez', 50000),
    ('claudia lezcano', 700000),
    ('claudia popiw', 90000),
    ('claudia rocha', 170000),
    ('claudia rolon', 151000),
    ('claudia vaezquen', 2320000),
    ('claudia villala', 100000),
    ('corina mieles', 260000),
    ('crisitina galeano', 550000),
    ('cristal amarilla', 120000),
    ('cristel arevalos', 250000),
    ('cristhian mercado', 480000),
    ('cristina alvarenga', 920000),
    ('cristina galeano', 290000),
    ('cynthia gimenez', 100000),
    ('cynthia lopez', 310000),
    ('cynthia rojas', 210000),
    ('cynthia vera', 720000),
    ('cynthia villalba', 70000),
    ('dahiana arrua', 60000),
    ('dahiana britez', 80000),
    ('dahiana cardozo', 260000),
    ('dahiana duarte', 600000),
    ('dahiana hevrt', 140000),
    ('dahiana melgarejo', 340000)
  ) AS v(nombre_key, eval)
  WHERE t.nombre_key = v.nombre_key;


  UPDATE tmp_import_clientes t
  SET evaluaciones = v.eval
  FROM (VALUES
    ('dahiana moreno', 214000),
    ('dahiana pesoa', 1300000),
    ('dahiana rivarola', 170000),
    ('dahiana silva', 130000),
    ('dahiyana martinez', 820000),
    ('daiana robledo', 70000),
    ('daisy imas', 725000),
    ('daisy irala', 470000),
    ('daisy leisamay', 160000),
    ('daisy romero', 440000),
    ('daisy toledo', 110000),
    ('dalila ramirez', 230000),
    ('dallys echeverria', 230000),
    ('dalma', 150000),
    ('dalma nerea torres', 150000),
    ('damagini gini', 110000),
    ('damaris baez', 530000),
    ('damaris delgado', 500000),
    ('dana garcete', 200000),
    ('dana riveros', 290000),
    ('dana vera', 370000),
    ('daniel vera', 190000),
    ('daniela bordom', 53000),
    ('daniela cespedes', 570000),
    ('daniela diaz', 340000),
    ('daniela larrosa', 150000),
    ('daniela wytthenbach', 150000),
    ('danna saldivar', 190000),
    ('dara britez', 160000),
    ('dario orrego', 200000),
    ('daysi medina', 80000),
    ('debora sanchez', 110000),
    ('deisy gamarra', 120000),
    ('deisy gonzalez', 280000),
    ('delia gimenez', 120000),
    ('derlis gimenez', 140000),
    ('desire ayala', 200000),
    ('devani rojas', 58800),
    ('deysi romero', 220000),
    ('diana aguayo', 230000),
    ('diana aguero', 270000),
    ('diana amarilla', 600000),
    ('diana aveiro', 29000),
    ('diana caballero', 50000),
    ('diana colman', 250000),
    ('diana cristaldo', 1390000),
    ('diana espinosa', 70000),
    ('diana martinez', 160000),
    ('diana melgarejo', 100000),
    ('diana mesa', 80000),
    ('diana meza', 270000),
    ('diana moquelos', 90000),
    ('diana paniagua', 400000),
    ('diana riquelme', 390000),
    ('diana rolon', 400000),
    ('diana valdovinos', 410000),
    ('diane lopez', 140000),
    ('diego colman', 260000),
    ('diego mechetti', 360000),
    ('diego silva', 220000),
    ('dilce rodriguez', 420000),
    ('diva gonzalez', 1490000),
    ('diwa gonzalez', 90000),
    ('dora lacarrubba', 100000),
    ('dorys rojas', 270000),
    ('dulce pacher', 550000),
    ('dulce velazquez', 100000),
    ('edita fiore', 60000),
    ('edita fiorre', 310000),
    ('edith nunez', 140000),
    ('eduardo duarte', 390000),
    ('eduardo zarza', 230000),
    ('elen ibanez', 290000),
    ('elena alcaraz', 24000),
    ('elena fernandez', 120000),
    ('elena nunez', 330000),
    ('eli cantero', 110000),
    ('eli melgarejo', 220000),
    ('eliana acosta', 280000),
    ('eliana bogado', 1950000),
    ('eliana centurion', 1186000),
    ('eliana martinez', 150000),
    ('eliana orue', 460000),
    ('eliana toedero', 100000),
    ('eliane', 420000),
    ('eliane cors', 350000),
    ('elianne linares', 780000),
    ('elin fortner', 80000),
    ('elisa', 80000),
    ('eliza rojas', 430000),
    ('eliza rubinstey', 510000),
    ('elizabet melgarejo', 904000),
    ('elizabeth benitez', 80000),
    ('elizabeth ruiz', 362000),
    ('elizabeth villalba', 1500000),
    ('ella robledo', 560000),
    ('ella romero', 430000),
    ('elma masi', 284000),
    ('eloisa alarcon', 390000),
    ('elva segovia', 240000),
    ('ema gonzalez', 380000),
    ('emilce candia', 240000),
    ('emili aguilar', 340000),
    ('emilia ferreira', 160000),
    ('emilia rodriguez', 1570000),
    ('emilse sanchez', 180000),
    ('emily aguilar', 230000),
    ('eriadna hernandez', 90000),
    ('erica guerreros', 30000),
    ('erica soria', 130000),
    ('erika bareiro', 430000),
    ('erika duarte', 140000),
    ('erika espinoza', 350000),
    ('erika estigarribia', 100000),
    ('erika frutos', 110000),
    ('erika martinez', 130000),
    ('erika rolon', 50000),
    ('esmeralda lopez gonzalez', 80000),
    ('estefani gamarra', 690000),
    ('estefani pati;a', 510000),
    ('estefani rodriguez', 210000),
    ('estefania cristaldo', 160000),
    ('estela cespedes', 330000),
    ('estiven baez', 420000),
    ('eva bazzano', 230000),
    ('eva ortiz', 280000),
    ('eva penal', 90000),
    ('eva penayo', 400000),
    ('evani lovera', 60000),
    ('evelia fernandez', 150000),
    ('evelin benitez', 310000),
    ('evelin gimenez', 30000),
    ('evelyn', 30000),
    ('evelyn alverez', 70000),
    ('evelyn barberan', 1240000),
    ('evelyn caceres', 120000),
    ('evelyn castineira', 920000),
    ('evelyn franco', 240000),
    ('evelyn gimenez', 180000),
    ('evelyn gonzalez', 44000),
    ('evelyn lopez', 680000),
    ('evelyn nunez', 240000),
    ('evelyn palacio', 170000),
    ('evelyn pedrozo', 490000),
    ('evelyn ramirez', 680000),
    ('evelyn santa cruz', 44000),
    ('evelyn vera', 100000),
    ('evelyn veron', 700000),
    ('everson frutos', 120000),
    ('fabiola dominguez', 40000),
    ('fabiola franco', 121000),
    ('fabiola garcia', 90000),
    ('fabiola maciel', 300000),
    ('fabiola marecos', 230000),
    ('fabiola melgarejo', 100000),
    ('fabiola mendoza', 1200000),
    ('fabiola mercado', 340000),
    ('fabiola ojeda', 1775000),
    ('fabiola ortellado', 1500000),
    ('fabiola peralta', 44000),
    ('fanny hosmann', 2820000),
    ('fanny noemi', 280000),
    ('fannyhofmann', 1010000),
    ('fany martinez', 170000),
    ('farima caceres', 40000),
    ('fashion go', 484000),
    ('fatima (fardo segunda bolsa premium)', 6000000),
    ('fatima (fardo)', 6000000),
    ('fatima angelino', 1070000),
    ('fatima arce', 40000),
    ('fatima arrua', 230000),
    ('fatima benegas', 200000),
    ('fatima benitez', 38000),
    ('fatima caballero', 370000),
    ('fatima delvalle', 180000),
    ('fatima lopez', 451000),
    ('fatima moreno', 150000),
    ('fatima ojeda', 120000),
    ('fatima ortega', 424000),
    ('fatima paez', 160000),
    ('fatima pazmor', 110000),
    ('fatima salinas', 470000),
    ('fatima vega', 500000),
    ('fedra perez', 111000),
    ('felix areco', 50000),
    ('fernanda aguilera', 170000),
    ('fernanda caballero', 180000),
    ('fernanda farina', 340000),
    ('fernanda fernandez', 120000),
    ('fernanda noguera', 174000),
    ('fernanda rodriguez', 270000),
    ('fernanda unez', 200000),
    ('fernando brugada', 40000),
    ('fidelina diana', 200000),
    ('fio martinez', 120000),
    ('fiona vanessa', 100000),
    ('fiorela diaz', 360000),
    ('fiorella aguilar', 280000),
    ('fiorella della loggia', 170000),
    ('fiorella delvalle', 280000),
    ('fiorella especial', 39000),
    ('fiorella especiale', 29000),
    ('fiorella fernandez', 140000),
    ('fiorella flecha', 180000),
    ('fiorella garcete', 1390000),
    ('fiorella garcia', 30000),
    ('fiorella larece', 60000),
    ('fiorella melgarejo', 120000),
    ('fiorella pelliccetti', 1500000),
    ('fiorella ramirez', 1150000),
    ('fiorella recala', 60000),
    ('fiorella rejala', 481000),
    ('fiorella virgili', 40000),
    ('flavia fretes', 120000),
    ('florencia boya', 140000),
    ('florencia gimenez', 70000),
    ('florencia otazu', 100000),
    ('florencia ruiz', 520000),
    ('florencia vaniz', 70000),
    ('florinda aguirre', 720000),
    ('gabino aguero', 233000),
    ('gabriela almeida', 65000),
    ('gabriela arrua', 80000),
    ('gabriela baez', 50000),
    ('gabriela batte', 520000),
    ('gabriela bogado', 430000),
    ('gabriela florentin', 150000),
    ('gabriela gamarra', 180000),
    ('gabriela garcia doldan', 610000),
    ('gabriela gomez', 320000),
    ('gabriela gonzalez', 170000),
    ('gabriela lopez', 120000),
    ('gabriela mongelos', 300000),
    ('gabriela moreno', 80000),
    ('gabriela nunez', 100000),
    ('gabriela ojeda', 110000),
    ('gabriela pereira', 140000),
    ('gabriela pretamoso', 230000),
    ('gabriela prieto', 560000),
    ('gabriela rojas', 460000),
    ('gabriela rotela', 230000),
    ('gabriela samaniego', 130000),
    ('gabriela villasanti', 1316000),
    ('gabriela zarza', 200000),
    ('galdys ruiz diaz', 300000),
    ('genesis lopez', 100000),
    ('geraldine castillo', 450000),
    ('geraldine gimenez', 230000),
    ('geraldine patino', 430000),
    ('gianina friendman', 110000),
    ('gianina vera', 210000),
    ('gimena fernandez', 70000),
    ('gisela cornet', 110000),
    ('gisela gomez', 370000),
    ('gisell patino', 60000),
    ('gisell reyes', 60000),
    ('gisella woitschach', 640000),
    ('giselle', 180000),
    ('giselle de los rios', 1980000),
    ('giselle gonzalez torres', 500000),
    ('giselle preda', 770000),
    ('giselle venegas', 130000),
    ('giselle vera', 120000),
    ('gissel fernandez', 240000),
    ('gissel samaniego', 240000),
    ('gissele gonsalez', 110000),
    ('gissella cornet', 220000),
    ('gladdys', 200000),
    ('gladys lopez duarte', 300000),
    ('gloria benitez', 480000),
    ('gloria ferreira', 440000),
    ('gloria larrosa', 270000),
    ('gloria latourrette', 90000),
    ('gloria melgarejo', 170000),
    ('gloria nunez', 425000),
    ('gloria portillo', 250000),
    ('gloria rodriguez', 510000),
    ('gloria ruiz dias', 250000),
    ('gloria torres', 80000),
    ('gloria zarza', 60000),
    ('godelieve de bleeck', 40000),
    ('govanni vissani', 50000),
    ('graciela frutos', 200000),
    ('graciela montanea', 230000),
    ('graciela moreno', 68000),
    ('graciela romero', 50000),
    ('greta romero', 130000),
    ('gricelda candia', 70000),
    ('griselda candia', 210000),
    ('griselda florentin', 1000000),
    ('griselda florentino', 180000),
    ('griselda liste', 50000),
    ('griselda rodas', 120000),
    ('guadalupe cabrera', 160000),
    ('guadalupe centurion', 160000),
    ('guadalupe chena', 420000),
    ('guadalupe esapinola', 360000),
    ('guadalupe figueredo', 140000),
    ('guadalupe perez', 170000),
    ('guadalupe sanchez', 290000),
    ('guadalupe torres', 150000),
    ('guido boselli', 250000),
    ('guido quinhonez', 600000),
    ('guido quinonez', 90000),
    ('hebillas monos y vinchas', 569025),
    ('heidy barrios', 260000),
    ('helen garcia', 40000),
    ('helen martinez', 670000),
    ('helena martinez', 210000),
    ('hillary rodriguez', 710000),
    ('hugo barrios', 120000),
    ('iara sejas', 260000),
    ('ibeth benitez', 1110000),
    ('ida prieto', 140000),
    ('idalina pena', 100000),
    ('ignacia ayala', 243000),
    ('ileana martinez', 170000),
    ('iliana rubin', 730000),
    ('ilsa flores', 200000),
    ('iluminada gomez', 400000),
    ('ines fernandez', 300000),
    ('ines guzman', 100000),
    ('ingreso tassi', 900000),
    ('ingrid dapper', 220000),
    ('ingrid guerrero', 340000),
    ('iricie godoy', 130000),
    ('irina obarski', 590000),
    ('isabel baez', 170000),
    ('isabel caballero', 230000),
    ('isabel caceres', 960000),
    ('isabel franco', 750000),
    ('isabel gomez', 720000),
    ('isabel ortiz', 400000),
    ('isabell estigarribia', 70000),
    ('isabella pisani', 200000),
    ('isaias machuca', 210000),
    ('isamar farina', 550000),
    ('ivan pineda', 430000),
    ('ivan villalba', 20000),
    ('ivana galeano', 74000),
    ('ivanna ramirez', 370000),
    ('ivon ahrens', 400000),
    ('janice gill', 170000),
    ('janina barrios', 270000),
    ('janina friendman', 130000),
    ('janina miranda', 120000),
    ('janina orrego', 440000),
    ('janina portillo', 370000),
    ('jaquelin gonzalez', 120000),
    ('jaqueline aquino', 40000),
    ('javier castillo', 40000),
    ('jazeli hermosilla', 260000),
    ('jazely hermisilla', 400000),
    ('jazmin aguallo', 300000),
    ('jazmin aguayo', 180000),
    ('jazmin benitez', 590000),
    ('jazmin cespedes', 160000),
    ('jazmin escurra', 40000),
    ('jazmin galarza', 170000),
    ('jazmin galeano', 110000),
    ('jazmin gavilan', 314000),
    ('jazmin gimenez', 100000),
    ('jazmin hamuy', 120000),
    ('jazmin jara', 90000),
    ('jazmin lopez', 390000),
    ('jazmin maschio', 1670000),
    ('jazmin modesto', 350000),
    ('jazmin moreira', 190000),
    ('jazmin sanabria', 210000),
    ('jazmin villalba', 370000),
    ('jemima barrios', 6160000),
    ('jemima canhete', 240000),
    ('jeni miranda', 780000),
    ('jeni rodriguez', 280000),
    ('jenifer rivas', 90000),
    ('jeniffer lopez', 550000),
    ('jessica arevalos', 127000),
    ('jessica arrua', 70000),
    ('jessica borja', 220000),
    ('jessica cantero', 170000),
    ('jessica castillo', 270000),
    ('jessica chavez', 60000),
    ('jessica curre', 70000),
    ('jessica curril', 80000),
    ('jessica duarte', 100000),
    ('jessica escobar', 250000),
    ('jessica ferreira', 260000),
    ('jessica fleitas', 130000),
    ('jessica galeano', 680000),
    ('jessica gill', 130000),
    ('jessica gonzalez', 870000),
    ('jessica leon', 110000),
    ('jessica noguera', 70000),
    ('jessica nunez', 260000),
    ('jessica ortigoza', 618000),
    ('jessica orue', 640000),
    ('jessica pinanex', 320000),
    ('jessica stefanni', 360000),
    ('jessica tiede', 100000),
    ('jessica zarate', 270000),
    ('jessy stewart', 380000),
    ('jessyca casco', 190000),
    ('jhemima canete', 880000),
    ('jimena adorno', 400000),
    ('jimena cabanhas', 50000),
    ('jimena fretes', 100000),
    ('jimena galeano', 60000),
    ('jimena rodriguez', 240000),
    ('joel sutton', 2260000),
    ('johana benitez', 102000),
    ('johana bogado', 310000),
    ('johana gonzalez', 180000),
    ('johana leiva', 850000),
    ('johana lopez', 200000),
    ('johana portillo', 140000),
    ('johana robledo', 114000),
    ('johana saldivar', 344000),
    ('johanna garcia', 70000),
    ('johanny vivas', 300000),
    ('jorge inciarte', 90000),
    ('jose caceres', 1500000),
    ('jose lodopacher', 300000),
    ('jose torres', 140000),
    ('joselin blanco', 130000),
    ('juan santacruz', 50000),
    ('juan sosa', 310000),
    ('juan verdun', 389000),
    ('judith torales', 40000),
    ('juguetitos', 112500),
    ('julia barrios', 170000),
    ('julia paredes', 400000),
    ('juliana benitez', 50000),
    ('julieta rosini', 290000),
    ('julieta villasboa', 160000),
    ('kaeyla sosa', 320000),
    ('kamamia', 5934700),
    ('kamamya', 23801630),
    ('kamamya conjuntos frio', 5973600),
    ('karen arca', 130000),
    ('karen barrios', 60000),
    ('karen delacruz', 187000),
    ('karen figueredo', 370000),
    ('karen garcete', 360000),
    ('karen gonzalez', 320000),
    ('karen jara', 360000),
    ('karen maldonado', 120000),
    ('karen mora', 130000),
    ('karina areco', 160000),
    ('karina benitez', 240000),
    ('karina leiva', 110000),
    ('karina lopez', 270000),
    ('karina maldonado', 370000),
    ('karina martinez', 690000),
    ('karina rodriguez', 500000),
    ('karina rosa', 70000),
    ('karina silva', 1120000),
    ('karine flores de caumpos', 470000),
    ('katerin delgado', 260000),
    ('katerin romero', 270000),
    ('katherin pereira', 110000),
    ('katherin schachtebeck', 880000),
    ('katherin wright', 60000),
    ('katherine alvarez', 540000),
    ('katherine riveros', 330000),
    ('kathiana lopez', 140000),
    ('kathya corrales', 340000),
    ('katia ferreira', 360000),
    ('katia riveros', 250000),
    ('katrine lewkowitz', 380000),
    ('katty delgado', 240000),
    ('katya quintana', 110000),
    ('keila prieto', 120000),
    ('kem kem', 480000),
    ('keyla sosa', 200000),
    ('kiara rijas', 330000),
    ('kiara rocher', 250000),
    ('kim familys', 450500),
    ('kimberly ramoa', 90000),
    ('kims family', 18769500),
    ('korina vera', 570000),
    ('kyms family', 2336000),
    ('la nueva juguetes', 422500),
    ('laila aguero', 1500000),
    ('lara avente', 190000),
    ('laran sofia', 490000),
    ('larisa gomez', 200000),
    ('larisa leid', 90000),
    ('larisa lopez', 250000),
    ('larisa reyes', 20000),
    ('larisa samo', 410000),
    ('larisa yunis', 490000),
    ('larisayunis', 60000),
    ('larissa aguilar', 207000),
    ('larissa cabrera', 1070000),
    ('larissa noguera', 230000),
    ('larissa ortiz', 230000),
    ('larissa pohl', 230000),
    ('larissa samo', 410000),
    ('laura almada', 130000),
    ('laura alvarez', 990000)
  ) AS v(nombre_key, eval)
  WHERE t.nombre_key = v.nombre_key;


  UPDATE tmp_import_clientes t
  SET evaluaciones = v.eval
  FROM (VALUES
    ('laura aquino', 58000),
    ('laura araujo', 230000),
    ('laura avalos', 60000),
    ('laura ayala', 160000),
    ('laura barbosa', 490000),
    ('laura bareiro', 460000),
    ('laura benitez', 140000),
    ('laura cabrera', 50000),
    ('laura caceres vera', 180000),
    ('laura canete', 400000),
    ('laura coronel', 350000),
    ('laura duarte', 20000),
    ('laura eddine', 170000),
    ('laura espinola', 170000),
    ('laura flores', 40000),
    ('laura gil', 120000),
    ('laura herrera', 80000),
    ('laura lodermair', 90000),
    ('laura martinez', 100000),
    ('laura noguera', 40000),
    ('laura quinonez', 210000),
    ('laura recalde', 410000),
    ('laura rufener', 223000),
    ('laura talavera', 1220000),
    ('laura vera', 540000),
    ('laura villalba', 230000),
    ('laura villanueva', 260000),
    ('laura zorrilla', 190000),
    ('lavado fer', 4100000),
    ('leila figueredo', 540000),
    ('leila ramirez', 100000),
    ('leila roman franco', 100000),
    ('lenis santacruz', 150000),
    ('lentes', 837618),
    ('lentes cde', 180000),
    ('lentes cerca de lyf', 132000),
    ('lentes merc', 110000),
    ('lentes nuevos ciclistas', 180000),
    ('lentes tassi cde', 504000),
    ('lentes tassi m4', 220000),
    ('leslie peason', 24000),
    ('leti rodas', 300000),
    ('leticia', 350000),
    ('leticia acosta', 600000),
    ('leticia acuna', 90000),
    ('leticia alderete', 320000),
    ('leticia almada', 310000),
    ('leticia aquino', 120000),
    ('leticia ayala', 480000),
    ('leticia benitez', 260000),
    ('leticia cardozo', 550000),
    ('leticia cassa', 40000),
    ('leticia encina', 430000),
    ('leticia esquivel', 190000),
    ('leticia ferreira', 110000),
    ('leticia figarfia', 790000),
    ('leticia figueredo', 220000),
    ('leticia garcete', 60000),
    ('leticia horvath', 1470000),
    ('leticia llanos', 150000),
    ('leticia lopez', 40000),
    ('leticia mercado', 222000),
    ('leticia molas', 370000),
    ('leticia nunes', 131000),
    ('leticia obelar', 660000),
    ('leticia ojeda', 250000),
    ('leticia ovelar', 40000),
    ('leticia rivas', 350000),
    ('leticia ruiz diaz', 300000),
    ('leticia sanabria', 160000),
    ('leticia sanchez', 200000),
    ('leticia saravia', 200000),
    ('leticia vera', 530000),
    ('lidia', 480000),
    ('lidia pereira', 450000),
    ('lilian', 500000),
    ('lilian ayala', 190000),
    ('lilian esquivel', 2250000),
    ('lilian fabio', 440000),
    ('lilian figueredo', 24000),
    ('lilian ortiz', 490000),
    ('lilian ramirez', 390000),
    ('lilian ruiz', 70000),
    ('lilian sanchez', 50000),
    ('liliana baez', 210000),
    ('liliana benitez', 190000),
    ('liliana gonzalez', 90000),
    ('liliana martinez', 680000),
    ('lilianoviedo', 230000),
    ('linda espinola', 230000),
    ('linzi britos', 70000),
    ('lissie dominguez', 70000),
    ('lissiedominguez', 250000),
    ('liz', 250000),
    ('liz alcaraz', 190000),
    ('liz amarilla', 140000),
    ('liz armoa', 300000),
    ('liz avalos', 50000),
    ('liz bogado', 40000),
    ('liz britez', 30000),
    ('liz brizuela', 360000),
    ('liz candia', 230000),
    ('liz cantero', 250000),
    ('liz colman', 110000),
    ('liz cuba', 270000),
    ('liz franco', 140000),
    ('liz gauto', 63000),
    ('liz martinez', 1330000),
    ('liz nunez', 70000),
    ('liz ocampos', 300000),
    ('liz robledo', 750000),
    ('liz rodriguez', 450000),
    ('liz romero', 80000),
    ('liz saucedo', 234000),
    ('liz zayas', 110000),
    ('liza contrera', 320000),
    ('liza santacruz', 250000),
    ('lizi fajardo', 420000),
    ('lluvia quintana', 20000),
    ('lorena', 110000),
    ('lorena barrios', 272000),
    ('lorena castillo', 210000),
    ('lorena cespedes', 200000),
    ('lorena koopmann', 1224000),
    ('lorena leon', 110000),
    ('lorena ortiz', 430000),
    ('lorena sanchez', 200000),
    ('lorena vargas', 220000),
    ('lorena vazquez', 170000),
    ('lorena viveros', 306000),
    ('lorna diwa', 600000),
    ('lourdes acunha', 150000),
    ('lourdes barreiro', 170000),
    ('lourdes espinola', 150000),
    ('lourdes gamarra', 90000),
    ('lourdes gonzalez', 270000),
    ('lourdes lopez', 53000),
    ('lourdes mancito', 500000),
    ('lourdes martinez', 50000),
    ('lourdes olmedo', 240000),
    ('lourdes rodriguez', 220000),
    ('lourdes ruiz diaz', 100000),
    ('lourdes saragoza', 70000),
    ('lourdez paredes', 200000),
    ('love you forever', 5917500),
    ('love you forever tassi', 4838000),
    ('luana alvarez', 214000),
    ('luana escobar', 170000),
    ('luana flores', 220000),
    ('luana mendoza', 272000),
    ('lucia amaro', 300000),
    ('lucia galeano', 1080000),
    ('lucia garcete', 220000),
    ('lucia halley', 810000),
    ('lucia rodriguez', 120000),
    ('luciana calijaris', 1800000),
    ('luciana vera', 180000),
    ('luis panza', 2000000),
    ('luis rolon', 260000),
    ('lujan benitez', 180000),
    ('lujan cabrera', 80000),
    ('lujan colman', 70000),
    ('lujan lopez', 170000),
    ('lujan morel', 160000),
    ('lujan ojeda', 190000),
    ('lujan pereyra', 170000),
    ('lujan pintos', 600000),
    ('lujan rivero', 320000),
    ('lujan rodriguez', 440000),
    ('lujan rojas', 70000),
    ('lujan sanabria', 110000),
    ('lujan valdez', 220000),
    ('lurdes barreto', 75000),
    ('lurdes estigarribia', 520000),
    ('lurdes etigarribia', 60000),
    ('lurdes oviedo', 55000),
    ('lurdes perez', 200000),
    ('lurdes trinidad', 130000),
    ('lurdes zorrilla', 340000),
    ('luz estigarribia', 170000),
    ('luz florentin', 250000),
    ('luz gonzalez', 430000),
    ('luz ortiz', 420000),
    ('luz ovelar', 250000),
    ('luz pereira', 102000),
    ('luz ramirez', 80000),
    ('luz rotela', 230000),
    ('lyf', 8929400),
    ('lyf sets', 3150000),
    ('ma angel barrios', 340000),
    ('mabel adorno', 125000),
    ('mabel benitez', 480000),
    ('mabel borges', 90000),
    ('mabel paredes', 140000),
    ('macarena amarilla', 110000),
    ('macarena aponte', 300000),
    ('macarena cristaldo', 1955000),
    ('macarena gutierrez', 220000),
    ('macarena morel', 230000),
    ('macarena noguera', 300000),
    ('macarena riveros', 423000),
    ('madai chavez', 140000),
    ('made', 129000),
    ('madelin cabanas', 148000),
    ('mafe mora', 181000),
    ('magali aralcon', 150000),
    ('magali benitez', 700000),
    ('magali fucusara', 130000),
    ('magali garcete', 275000),
    ('magali mereles', 15000),
    ('magali moreno', 180000),
    ('magali palacios', 75000),
    ('magali peris', 2710000),
    ('magui mendez', 30000),
    ('maida echeverria', 100000),
    ('maira capdevila', 150000),
    ('maira coronel', 160000),
    ('maira pappalardo', 774000),
    ('maira vega', 110000),
    ('maira zelaya', 372000),
    ('majo avalos', 90000),
    ('manuela garcia', 230000),
    ('mara benitez', 160000),
    ('mara cantero', 120000),
    ('mara ferreira', 230000),
    ('mara gomez', 170000),
    ('mara guerrero', 210000),
    ('mara morel', 70000),
    ('mara recalde', 90000),
    ('mara sugastii', 110000),
    ('marcela borja', 30000),
    ('marcela britos', 160000),
    ('marcela canhiza', 290000),
    ('marcela mendieta', 130000),
    ('marcela torres', 110000),
    ('marcos gimenez', 240000),
    ('maren baltel', 210000),
    ('margarita', 160000),
    ('margarita alvarez', 780000),
    ('mari dominguez', 120000),
    ('maria', 800000),
    ('maria acevedo', 600000),
    ('maria adorno', 50000),
    ('maria alejandra', 200000),
    ('maria alvarenga', 300000),
    ('maria azucena prieto', 380000),
    ('maria barboza', 150000),
    ('maria belen villalba', 750000),
    ('maria benitez', 1500000),
    ('maria cabrera', 50000),
    ('maria cecilia gonzalez', 200000),
    ('maria del carmen armoa', 150000),
    ('maria del pilar cabral', 520000),
    ('maria emilia', 170000),
    ('maria espinola', 90000),
    ('maria eugenia', 290000),
    ('maria eugenia garcia', 300000),
    ('maria fernandez', 300000),
    ('maria ferrer', 190000),
    ('maria fleitas', 220000),
    ('maria fleytas', 200000),
    ('maria flores', 115000),
    ('maria franco', 400000),
    ('maria gimenez', 100000),
    ('maria gonzalez', 230000),
    ('maria hidalgo', 300000),
    ('maria jara', 280000),
    ('maria jesus gomez', 200000),
    ('maria jose', 473000),
    ('maria jose achucarro', 230000),
    ('maria jose benitez', 1540000),
    ('maria jose cabanhas', 520000),
    ('maria jose ceccoli', 320000),
    ('maria jose di pardo', 860000),
    ('maria jose diaz', 130000),
    ('maria jose gamorro', 110000),
    ('maria jose isasis', 140000),
    ('maria jose ojeda', 340000),
    ('maria jose rojas', 210000),
    ('maria jose sosa', 440000),
    ('maria laura paez', 80000),
    ('maria leticia', 230000),
    ('maria liz', 161000),
    ('maria liz alvarenga', 251000),
    ('maria llano', 200000),
    ('maria luisa granse', 210000),
    ('maria maciel', 180000),
    ('maria martinez', 100000),
    ('maria melgarejo', 210000),
    ('maria miranda', 520000),
    ('maria miranda doria', 1800000),
    ('maria ocampos', 160000),
    ('maria ofelia cassignol', 280000),
    ('maria ojeda', 80000),
    ('maria pavon', 240000),
    ('maria paz', 680000),
    ('maria paz aveiro', 350000),
    ('maria paz barboza', 40000),
    ('maria paz vera', 112000),
    ('maria peralta', 500000),
    ('maria pintos', 160000),
    ('maria rodriguez', 90000),
    ('maria rosa alvedo', 101000),
    ('maria sanchez', 700000),
    ('maria sosa', 620000),
    ('maria troche', 280000),
    ('maria zamuera', 70000),
    ('mariam gonzalez', 250000),
    ('marian', 184000),
    ('marian garcia', 180000),
    ('marian martinez', 1120000),
    ('marian reyes', 160000),
    ('marian yegros', 270000),
    ('mariana anonelli', 222000),
    ('mariana antonelli', 350000),
    ('mariana chaves', 1430000),
    ('mariana oliveira', 2572000),
    ('mariana silvera', 60000),
    ('mariano', 400000),
    ('mariano bilek', 530000),
    ('mariano cantero', 300000),
    ('maribel chavez', 450000),
    ('maricel torres', 580000),
    ('mariel gomez', 50000),
    ('mariel leon', 441000),
    ('mariela brites', 60000),
    ('mariela brizuela', 270000),
    ('mariela gauto', 50000),
    ('mariela gonzalez', 520000),
    ('mariela guillen', 190000),
    ('mariela pita', 400000),
    ('mariela quinon', 70000),
    ('mariela valdez', 140000),
    ('mario dominguez', 150000),
    ('marisol grans', 280000),
    ('marisol romero', 400000),
    ('marisol viera', 120000),
    ('marlene amarilla', 100000),
    ('marlene fretes', 160000),
    ('marlene romero', 190000),
    ('marlene villagra', 242000),
    ('marli anzotegui', 340000),
    ('marta balmaceda', 50000),
    ('marta benegas', 340000),
    ('marta danei', 144000),
    ('marta mereles', 1010000),
    ('marta recalde', 30000),
    ('marta tonanez', 760000),
    ('marta zaracho', 690000),
    ('marta zarate', 700000),
    ('martha arriola afara', 150000),
    ('martha gonzalez', 490000),
    ('martha tonanez', 190000),
    ('martina fernandez', 90000),
    ('mary fernandez', 60000),
    ('mati alfonso', 170000),
    ('matias rodas', 170000),
    ('matilde gonzalez', 4760000),
    ('maura samudio', 150000),
    ('mauricio amarilla', 251000),
    ('mauricio frank', 50000),
    ('mayra capdevila', 110000),
    ('melisa chamorro', 690000),
    ('melisa correa', 60000),
    ('melisa desbar', 230000),
    ('melisa duarte', 560000),
    ('melisa ferreira', 160000),
    ('melisa ocampos', 1320000),
    ('melissa canale', 240000),
    ('melissa chamorro', 30000),
    ('melissa duarte', 900000),
    ('melissa ortiz', 60000),
    ('melissa salina', 230000),
    ('melissa spani', 120000),
    ('melissa zanchez', 1220000),
    ('meliza diaz', 440000),
    ('mercado', 2460000),
    ('mercedes ayala', 210000),
    ('mercedes ferreira', 2750000),
    ('mercedes gomez', 180000),
    ('mercedes gonzalez', 40000),
    ('mercedes laterra', 800000),
    ('mercedes martinez', 1650000),
    ('mercedes ortiz', 70000),
    ('mercedes rasmussen', 70000),
    ('mercedes samaniego', 120000),
    ('mercedes sanchez', 150000),
    ('mia paiba tufari', 110000),
    ('mia romero', 330000),
    ('micaela benitez', 200000),
    ('micaela martinez', 60000),
    ('micaela medina', 260000),
    ('micaela rojas', 890000),
    ('micaela zarate', 90000),
    ('micaelagomez', 230000),
    ('michal baten', 656000),
    ('michelle caceres', 190000),
    ('miguel cuevas', 60000),
    ('miguel quintana', 3250000),
    ('miguelina olguin', 260000),
    ('mikaela fleitas', 70000),
    ('mikaela marejo', 80000),
    ('milagro ayala', 160000),
    ('milagros', 40000),
    ('milagros arguello', 100000),
    ('milagros brites', 270000),
    ('milagros ferreira', 490000),
    ('milagros gill', 990000),
    ('milagros iguraca', 210000),
    ('milagros iuraca', 881000),
    ('milagros martinez', 230000),
    ('milagros medina', 130000),
    ('milagros rios', 90000),
    ('milagros santacruz', 90000),
    ('milena avalos', 120000),
    ('milena caballero', 200000),
    ('milena enciso', 430000),
    ('milka arzberger', 40000),
    ('milka cespedes', 530000),
    ('mirella mendez', 60000),
    ('mirella meza', 170000),
    ('mireya ramos', 760000),
    ('miriam perez', 260000),
    ('mirian denis', 370000),
    ('mirian diaz', 120000),
    ('mirian gimenez', 120000),
    ('mirian salinas', 140000),
    ('mirian sanchez', 78000),
    ('mirian telles', 490000),
    ('mirian torres', 860000),
    ('mirian viilalba', 150000),
    ('mirna denis', 29000),
    ('mirna escobar', 20000),
    ('mirna ferreira', 770000),
    ('mirta cardenas', 450000),
    ('mirta coleman', 520000),
    ('mirta moran', 190000),
    ('mirta sanchez', 120000),
    ('mirta sosa', 850000),
    ('mirtha medina', 320000),
    ('mirtha paredes', 270000),
    ('misti lopez', 230000),
    ('monica acosta', 120000),
    ('monica baetcke', 500000),
    ('monica bodys', 3640000),
    ('monica gimenez', 60000),
    ('monica martinez', 701000),
    ('monica ovelar', 300000),
    ('monica pizzani', 210000),
    ('monica rivas', 170000),
    ('monica romero', 140000),
    ('monica segovia', 240000),
    ('monitos', 864000),
    ('monitos blancos y eso', 130000),
    ('monse achon', 350000),
    ('monse benitez', 670000),
    ('monse el ghandour', 210000),
    ('monse gonzalez', 30000),
    ('monse leiva', 410000),
    ('monse rojas', 101000),
    ('monserat martinez', 30000),
    ('monserrat diaz', 100000),
    ('mordillo asia', 143000),
    ('mordillos shopping asia', 216000),
    ('myriam rojas', 170000),
    ('naara feris', 160000),
    ('nacny fretes', 150000),
    ('nadia bareiro', 530000),
    ('nadia gimenez', 230000),
    ('nadia meza', 270000),
    ('nadia roa', 60000),
    ('nadia ruiz', 990000),
    ('nadia soria', 42000),
    ('nahara feris', 190000),
    ('nailedin ferreira', 550000),
    ('nancy gimenez', 600000),
    ('nancy salinas', 500000),
    ('nancy villalba', 50000),
    ('naomi alarcon', 340000),
    ('naomi orube', 40000),
    ('naomi paniagua', 900000),
    ('nara lopez', 100000),
    ('nara valiente', 6091000),
    ('natali fidabel', 180000),
    ('natalia baez', 90000),
    ('natalia caballero', 40000),
    ('natalia dasilva', 75000),
    ('natalia dewitte', 100000),
    ('natalia marin', 360000),
    ('natalia medina', 500000),
    ('natalia montiel', 420000),
    ('natalia pena', 150000),
    ('natalia riquelme', 110000),
    ('natalia romero', 92000),
    ('natalia valdes', 121000),
    ('natalia valdivia', 180000),
    ('natalia vidal', 240000),
    ('natasha huttemann', 320000),
    ('nathali fidabel', 120000),
    ('nathalia barua', 170000)
  ) AS v(nombre_key, eval)
  WHERE t.nombre_key = v.nombre_key;


  UPDATE tmp_import_clientes t
  SET evaluaciones = v.eval
  FROM (VALUES
    ('nathalia bazan', 140000),
    ('nathalia candia', 150000),
    ('nathalia figueredo', 800000),
    ('nathalia gimenez', 100000),
    ('nathalia koopmann', 650000),
    ('nathalia lugen', 370000),
    ('nathalia lujen', 650000),
    ('nathalia marecos', 70000),
    ('nathalia martinez', 80000),
    ('nathalia ortiz', 1150000),
    ('nathasha majul', 130000),
    ('nayeli', 280000),
    ('nayeli baez', 80000),
    ('nayeli florentin', 19000),
    ('nayeli ortiz', 50000),
    ('nelida', 70000),
    ('nelida canan', 20000),
    ('nelly', 70000),
    ('nelly benega', 312000),
    ('nelly fleitas', 50000),
    ('nicolas kallsen', 200000),
    ('nicolas piraino', 430000),
    ('nicolas riveros', 280000),
    ('nicole figueredo', 220000),
    ('nicole rivas', 160000),
    ('nicole tocaimaza', 130000),
    ('nidia otto', 90000),
    ('nidia rodriguez', 140000),
    ('nidia samudio', 1540000),
    ('nieve gonzalez', 310000),
    ('nilda rotela', 850000),
    ('nilsa morel', 160000),
    ('nilsa paez', 340000),
    ('nine nien cde', 1455787),
    ('noelia anoa', 150000),
    ('noelia benitez', 120000),
    ('noelia conteiro', 190000),
    ('noelia diaz', 700000),
    ('noelia dugo', 90000),
    ('noelia lezcano', 280000),
    ('noelia mrecos', 230000),
    ('noelia ovelar', 300000),
    ('noelia perez', 50000),
    ('noelia romero', 330000),
    ('noelia samaniego', 640000),
    ('noelia silva', 310000),
    ('noemi alvarenga', 260000),
    ('noemi galeano', 264000),
    ('noemi miranda', 440000),
    ('noemi vidanda', 360000),
    ('nora escobar', 170000),
    ('nora insfran', 40000),
    ('norma marizo', 150000),
    ('nuria ojeda', 320000),
    ('olga cantero', 200000),
    ('olga paredes', 180000),
    ('orfa diaz', 130000),
    ('oriana robledo', 254000),
    ('ornella ferreira', 674000),
    ('ornella mendoza', 90000),
    ('oshkosh juliana', 2058000),
    ('pablo gonzalez', 100000),
    ('paloma brugada', 280000),
    ('paloma perez', 90000),
    ('paloma segovia', 100000),
    ('paloma villalba', 293000),
    ('pamela campos', 700000),
    ('pamela gonzalez', 310000),
    ('pamela gracia', 234000),
    ('pamela mendieta', 60000),
    ('pamela ortiz', 30000),
    ('pamela pinhanez', 70000),
    ('pamela recalde', 440000),
    ('pamela ricalde', 50000),
    ('pamela riquelme', 340000),
    ('pamela salinas', 80000),
    ('pamela torres', 1124000),
    ('paola', 120000),
    ('paola alonzo', 101000),
    ('paola alujas', 600000),
    ('paola britez', 370000),
    ('paola cristaldo', 440000),
    ('paola diaz', 110000),
    ('paola dominguez', 670000),
    ('paola duarte', 300000),
    ('paola espinola', 50000),
    ('paola evers', 170000),
    ('paola ferrer', 110000),
    ('paola martinez', 130000),
    ('paola paiva', 150000),
    ('paola pintos', 251000),
    ('paola salinas', 500000),
    ('paq 3 prendas lyf 18 y 24', 1072000),
    ('patricia', 70000),
    ('patricia alvarez', 60000),
    ('patricia bareiro', 290000),
    ('patricia billasboa', 400000),
    ('patricia cabrera', 890000),
    ('patricia cristaldo', 19000),
    ('patricia dejesus', 300000),
    ('patricia diaz', 190000),
    ('patricia duarte', 220000),
    ('patricia farinha', 260000),
    ('patricia flecha', 150000),
    ('patricia gauto', 980000),
    ('patricia gimenez', 290000),
    ('patricia gomez', 70000),
    ('patricia gray', 60000),
    ('patricia jara', 100000),
    ('patricia lopez', 1000000),
    ('patricia maidana recalde', 450000),
    ('patricia martinez', 70000),
    ('patricia mendoza', 290000),
    ('patricia mora', 984000),
    ('patricia ovelar', 900000),
    ('patricia pereira', 190000),
    ('patricia perez', 270000),
    ('patricia petzoldt', 130000),
    ('patricia ramirez', 130000),
    ('patricia recalde', 560000),
    ('patricia recalde martines', 220000),
    ('patricia rolon', 380000),
    ('patricia sanchez', 80000),
    ('patricia sap', 180000),
    ('patricia sosa', 80000),
    ('patricia thonzaca', 170000),
    ('patricia vera', 450000),
    ('paula', 200000),
    ('paula arias', 70000),
    ('paula cairlece', 320000),
    ('paula figueredo', 630000),
    ('paula llanes', 340000),
    ('paula mercado', 290000),
    ('paula moran', 90000),
    ('paula nunez', 550000),
    ('paula oviedo', 200000),
    ('paula pessoa', 240000),
    ('paula recalde', 140000),
    ('paula wagenr', 100000),
    ('paz barreto', 700000),
    ('paz lier', 100000),
    ('paz lird', 820000),
    ('paz patino', 350000),
    ('perla velazquez', 120000),
    ('petra martinez', 110000),
    ('piarela cabanas', 230000),
    ('pilar frutos', 1910000),
    ('pool francois', 100000),
    ('pricila goznalez', 180000),
    ('pricila moreira', 303000),
    ('pricila sutton', 2900000),
    ('prime bolsa fatima premium', 6000000),
    ('princes quintana', 230000),
    ('prisila gill', 220000),
    ('pulseras', 276000),
    ('raisa segovia', 534000),
    ('ramonita escurra', 170000),
    ('raquel barreto', 490000),
    ('raquel carreras', 650000),
    ('raquel dambi', 130000),
    ('raquel ozuna', 100000),
    ('raquel panizo', 93000),
    ('raquel rey ferreira', 70000),
    ('rebeca', 220000),
    ('rebeca abadie', 180000),
    ('rebeca aguilar', 450000),
    ('rebeca azurra', 260000),
    ('rebeca benitez', 1410000),
    ('rebeca gonzalez', 650000),
    ('rebeca kelnner', 470000),
    ('rebecca miranda', 180000),
    ('regina acuna', 140000),
    ('regina ortigoza', 100000),
    ('renata rojas', 422000),
    ('ricardo albosno', 270000),
    ('ricardo morel', 170000),
    ('roberto casco', 80000),
    ('rocio belen sanchez', 90000),
    ('rocio benitez', 1750000),
    ('rocio caballero', 540000),
    ('rocio chamorro', 360000),
    ('rocio cordoba', 27000),
    ('rocio diaz', 101000),
    ('rocio gonzalez', 70000),
    ('rocio martinez', 320000),
    ('rocio mendez', 70000),
    ('rocio mendoza', 200000),
    ('rocio orue', 900000),
    ('rocio santacruz', 210000),
    ('rodolfo mamani', 560000),
    ('rodrigo aguero', 60000),
    ('rodrigo cruz', 490000),
    ('rodrigo rivarola', 230000),
    ('rolando gomez', 103000),
    ('romina acosta', 383000),
    ('romina benitez', 526000),
    ('romina chamorro', 250000),
    ('romina colman', 70000),
    ('romina dure', 100000),
    ('romina gonzalez', 120000),
    ('romina guerrero', 170000),
    ('romina leguizamon', 550000),
    ('romina morinigo', 50000),
    ('romina ramirez santos', 70000),
    ('romina ricardi', 30000),
    ('romina robledo', 190000),
    ('romina ruguera', 250000),
    ('romina vonglasenapp', 3200000),
    ('rosa barrios', 160000),
    ('rosa galeano', 601000),
    ('rosa martinez', 880000),
    ('rosa montenegro', 200000),
    ('rosa morel', 660000),
    ('rosa ortiz', 90000),
    ('rosalia firifuero', 78000),
    ('rosana', 170000),
    ('rosana duarte', 400000),
    ('rosana eliceche', 85000),
    ('rosana gimenez', 162000),
    ('rosana mantiel', 220000),
    ('rosana vera', 80000),
    ('rosi diaz', 110000),
    ('rosmary armoa', 80000),
    ('rosmary suhsner', 160000),
    ('rosmery argana', 300000),
    ('rossana amarilla', 140000),
    ('rossana ozuna', 90000),
    ('rosy duarte', 410000),
    ('roxana avila', 180000),
    ('roxana gimenez', 230000),
    ('ruh quintana', 240000),
    ('ruth duarte', 450000),
    ('ruth ibarrola', 1720000),
    ('ruth leiva', 125000),
    ('ruth menialgo', 50000),
    ('ruth pereira', 120000),
    ('ruth perez', 180000),
    ('ruth prieto', 330000),
    ('ruth roa', 50000),
    ('ruth stollmair', 264000),
    ('ruth venialvo', 100000),
    ('sabrina catillo', 160000),
    ('sabrina sanchez', 210000),
    ('sadi gomez', 70000),
    ('sadi salul', 180000),
    ('sady salum', 400000),
    ('sair coleman', 200000),
    ('saira ibarra', 130000),
    ('saldo lentes arete', 108300),
    ('samanta vancleef', 560000),
    ('samira meza', 470000),
    ('sandra benitez', 346000),
    ('sandra benitrz', 300000),
    ('sandra burgos', 24000),
    ('sandra cabrera', 240000),
    ('sandra gonzalez', 860000),
    ('sandra liuzzi', 350000),
    ('sandra longo', 220000),
    ('sandra lugo', 200000),
    ('sandra ramos', 2933000),
    ('sandra saldivar', 440000),
    ('sandra valiente', 1250000),
    ('sandra velazquez', 130000),
    ('sanie ortiz', 30000),
    ('sannybell sachak', 80000),
    ('santiago espinola', 383000),
    ('sara aguero', 90000),
    ('sara alvarez', 90000),
    ('sara baez', 180000),
    ('sara benitez', 90000),
    ('sara chaparro', 670000),
    ('sara galiano', 94000),
    ('sara ledesma', 120000),
    ('sara martinez', 390000),
    ('sara mendez', 40000),
    ('sara ortiz', 50000),
    ('sara peralta', 350000),
    ('sara pereira', 180000),
    ('sara perez', 100000),
    ('sara veron', 70000),
    ('selene benitez', 40000),
    ('serena ocampos', 80000),
    ('sets lyf', 4200000),
    ('shirley arguello', 50000),
    ('shirley candia', 420000),
    ('shirley canete', 160000),
    ('shirley franco', 260000),
    ('shirley lovera', 40000),
    ('shirley silva', 240000),
    ('shopingg 99', 1275120),
    ('shopping 99', 2481678),
    ('shopping asia', 1178800),
    ('shopping itaipu', 1854396),
    ('shopping k', 2053181),
    ('shortcitos', 115000),
    ('shortcitos tassi', 200000),
    ('silvana lezcano', 170000),
    ('silvana mendez', 100000),
    ('silvia amarilla', 570000),
    ('silvia arguello', 250000),
    ('silvia belen britez', 80000),
    ('silvia benialgo', 270000),
    ('silvia casco', 150000),
    ('silvia lesmo', 64000),
    ('silvia lopez', 673000),
    ('silvia miranda', 150000),
    ('silvia sanchez', 330000),
    ('silvina venialgo', 730000),
    ('sofia abramian', 220000),
    ('sofia chun', 560000),
    ('sofia clameett', 120000),
    ('sofia escorzara', 330000),
    ('sofia gamarra', 220000),
    ('sofia llano', 580000),
    ('sofia lopez', 270000),
    ('sofia mendez', 28000),
    ('sofia murto', 310000),
    ('sofia quintana', 250000),
    ('sofia scorzara', 690000),
    ('sofia tijera', 170000),
    ('sofia velazquez', 60000),
    ('sofia villar', 350000),
    ('sol', 130000),
    ('sol alvarenga', 200000),
    ('sol cabanas', 946000),
    ('sol galeano', 250000),
    ('sol miranda', 130000),
    ('sol sanabria', 700000),
    ('sol torres', 550000),
    ('sol zarate', 310000),
    ('solange recaldo', 60000),
    ('soledad espinola', 280000),
    ('soledad galeano', 60000),
    ('soledad lescano', 150000),
    ('soledad villagra', 430000),
    ('sonia arevalos', 252000),
    ('sonia ayalla', 200000),
    ('sonia delgado', 170000),
    ('sonia gomez', 430000),
    ('sonia mae juliana', 480000),
    ('sonia ortiz', 50000),
    ('sonia villalba', 480000),
    ('stefania santalio', 680000),
    ('stefi urrustrazu', 190000),
    ('stiven baez', 180000),
    ('super k', 2040555),
    ('super k cde', 3004406),
    ('susan hermosilla', 170000),
    ('susan otazu', 160000),
    ('susana cuellar', 400000),
    ('susana gullari', 430000),
    ('susana nolbin', 50000),
    ('suyi lesme', 280000),
    ('sydel salinas', 120000),
    ('talia aquino', 70000),
    ('talia servin', 590000),
    ('talia stanley', 80000),
    ('tamara aguilar', 612000),
    ('tamara andino', 73000),
    ('tamara cardozo', 170000),
    ('tamara gomez', 650000),
    ('tamara gonzalez', 190000),
    ('tamara maldonado', 530000),
    ('tamara maricevch', 300000),
    ('tamara ojeda', 270000),
    ('tamara rodriguez', 180000),
    ('tania cabezudo', 1780000),
    ('tania diaz', 320000),
    ('tania fernandez', 200000),
    ('tania gomez', 60000),
    ('tania gonzalez', 780000),
    ('tania miltos', 120000),
    ('tania monsot', 150000),
    ('tania perez', 440000),
    ('tania sardi', 480000),
    ('tassi (luca)', 1382000),
    ('tassi (mercado)', 300000),
    ('tassi arete', 162000),
    ('tassi aros sp', 156000),
    ('tassi la nueva', 87500),
    ('tatiana barreto', 290000),
    ('tatiana espinola', 60000),
    ('tatiana mongelos', 40000),
    ('tatiana ortiz', 191000),
    ('tatiana paiva', 782000),
    ('tatiana portillo', 110000),
    ('telma aguilera', 70000),
    ('teofila godoy', 200000),
    ('teresa', 180000),
    ('teresa gill', 590000),
    ('teresa maidano', 200000),
    ('teresa villalba', 90000),
    ('teresita colman', 200000),
    ('teresita vega', 262000),
    ('thamara villalba', 1570000),
    ('tommy cristaldo', 660000),
    ('trinidad duarte', 580000),
    ('ursula bareiro', 570000),
    ('valentina ayala', 220000),
    ('valentina blaz', 210000),
    ('valentina llano', 27000),
    ('valentina mongelos', 140000),
    ('valeria baez', 180000),
    ('valeria barrios', 260000),
    ('valeria fernandez', 480000),
    ('valeria giani', 280000),
    ('valeria herreros', 950000),
    ('valeria mareco', 170000),
    ('valeria martinez', 220000),
    ('valeria rios', 230000),
    ('valeria veltice', 300000),
    ('valeria vera', 140000),
    ('vanesa aguilar', 2260000),
    ('vanesa espinola', 440000),
    ('vanesa genaro', 360000),
    ('vanesa gill', 540000),
    ('vanesa gonzalez', 310000),
    ('vanesa jara', 180000),
    ('vanesa ojeda', 750000),
    ('vanesa ramirez', 320000),
    ('vanesa viola', 760000),
    ('vanesa zarate', 500000),
    ('vanesa zelaya', 180000),
    ('vanessa cubas', 260000),
    ('vanessa graer', 190000),
    ('vanessa scarone', 770000),
    ('vanessa viola', 260000),
    ('vanessa zelaya', 170000),
    ('vania aveiro', 880000),
    ('vania quintana', 670000),
    ('vania sanchez', 90000),
    ('vanina albertin', 800000),
    ('vanina albertini', 390000),
    ('vanina areco', 150000),
    ('vanina carimbu', 380000),
    ('vanina nunin', 600000),
    ('vanina sunini', 100000),
    ('venigna sanchez', 560000),
    ('venus maldonado', 750000),
    ('venus nunes', 1020000),
    ('venus nunez', 490000),
    ('vera balbuena', 500000),
    ('veronica asfaduroff', 210000),
    ('veronica benitez', 391000),
    ('veronica cabrera', 240000),
    ('veronica cuebas', 30000),
    ('veronica flor', 190000),
    ('veronica gimenez', 400000),
    ('veronica medina', 354000),
    ('veronica morinigo', 240000),
    ('veronica nunez', 1270000),
    ('veronica osorio', 110000),
    ('veronica perez', 470000),
    ('veronica quinhonez', 630000),
    ('veronica quinonez', 380000),
    ('veronica ruiz', 70000),
    ('veronica sosa', 1000000),
    ('veronica vargas', 210000),
    ('victor villalba', 290000),
    ('victoria benitez', 400000),
    ('victoria rojas', 140000),
    ('virginia', 50000),
    ('virginia gonzalez', 330000),
    ('virginia grau', 2000000),
    ('vivi rojas', 70000),
    ('vivian centurion', 140000),
    ('vivian vesken', 460000),
    ('viviana allen', 80000),
    ('viviana benitez', 200000),
    ('viviana delgado', 400000),
    ('viviana espinosa', 160000),
    ('viviana monzon', 120000),
    ('viviana pintos', 440000),
    ('viviana rolon', 1120000),
    ('viviana von lucken', 300000),
    ('wendy aranda', 24000),
    ('wendy gonzalez', 440000),
    ('wilma alarcon', 1040000),
    ('wilma paiba', 130000),
    ('wilson barrientos', 14110000),
    ('wilson villagra', 100000),
    ('ximena alfonso', 700000),
    ('ximena fernandez', 100000),
    ('ximena garcete', 340000),
    ('xioana gomez', 120000),
    ('yadira ayala', 310000),
    ('yadira formigni', 160000),
    ('yami zarate', 150000),
    ('yamila cuellar', 390000),
    ('yamila jara', 390000),
    ('yamila valleau', 220000),
    ('yamile benitez', 1360000),
    ('yamilet zarza', 50000),
    ('yamileth zarza', 110000),
    ('yaneli ramirez', 200000),
    ('yang hyejin', 50000),
    ('yanina ayala', 440000),
    ('yanina burgos', 70000),
    ('yanina firgrroji', 240000),
    ('yanina garcete', 70000)
  ) AS v(nombre_key, eval)
  WHERE t.nombre_key = v.nombre_key;


  UPDATE tmp_import_clientes t
  SET evaluaciones = v.eval
  FROM (VALUES
    ('yanina lovero', 110000),
    ('yanina quintana', 80000),
    ('yanina romero', 50000),
    ('yanina silva', 50000),
    ('yanina stehlik', 180000),
    ('yanina vera', 50000),
    ('yanina villalba', 210000),
    ('yeimy gomez', 80000),
    ('yeni rodriguez', 340000),
    ('yeni rojas', 140000),
    ('yenifer cabral', 170000),
    ('yenny lezcano', 270000),
    ('yessica diaz', 84000),
    ('yisenia ramirez', 220000),
    ('yohana barboza', 170000),
    ('yohana esquivel', 290000),
    ('yohana wall', 130000),
    ('yolanda avila', 260000),
    ('yolanda oviedo', 220000),
    ('yvelis gonzalez', 78000),
    ('zara aguero', 250000),
    ('zibele chiattone', 286000),
    ('zoe perez', 610000),
    ('zoraya chamorro', 100000),
    ('zulma ortigoza', 53000),
    ('zuni', 60000),
    ('zunilda cabral', 50000),
    ('zunilda dasilba', 150000),
    ('zunilda franco', 440000),
    ('zunilda gonzalez', 140000),
    ('zuralda rojas', 140000)
  ) AS v(nombre_key, eval)
  WHERE t.nombre_key = v.nombre_key;


  -- Insertar ENTRADA de crédito histórico. Idempotente: skip si ya
  -- existe un movimiento con observaciones LIKE 'Migración histórica Excel%'
  -- para ese cliente (así correr el script 2 veces no duplica).
  INSERT INTO pronimerp.cliente_creditos_movimientos (
    empresa_id, cliente_id, tipo, monto, origen,
    referencia_tipo, observaciones, usuario_nombre
  )
  SELECT v_empresa_id, t.cliente_id, 'ENTRADA', t.evaluaciones, 'ajuste_manual',
         'migracion', 'Migración histórica Excel YO CRECI DIARIO PALMERAS 2025',
         'Migración automática'
  FROM tmp_import_clientes t
  WHERE t.evaluaciones > 0
    AND NOT EXISTS (
      SELECT 1 FROM pronimerp.cliente_creditos_movimientos m
      WHERE m.cliente_id = t.cliente_id
        AND m.observaciones LIKE 'Migración histórica Excel%'
    );

  RAISE NOTICE 'Migración completa. Empresa: %', v_empresa_id;
END
$mig$;
