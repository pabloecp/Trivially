const BB_VERANO =
  "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/3e/04/eb/3e04ebf6-370f-f59d-ec84-2c2643db92f1/196626945068.jpg/600x600bb.jpg";
const BB_YHL =
  "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/8c/0f/81/8c0f81f2-9f10-5e3d-b9de-5961a73e8e52/195081078724.jpg/600x600bb.jpg";
const BB_DTMF =
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/90/5e/7e/905e7ed5-a8fa-a8f3-cd06-0028fdf3afaa/199066342442.jpg/600x600bb.jpg";
const BB_ULTIMO =
  "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/c4/a0/65/c4a0650a-87b0-3514-4e0c-e32e5afbb3a6/194491183394.jpg/600x600bb.jpg";
const MORA_MICRO =
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/5b/4f/71/5b4f715a-5323-cc45-382a-7d0b4b69f418/196626706898.jpg/600x600bb.jpg";
const MORA_ESTRELLA =
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/ff/e3/6d/ffe36d58-d153-826d-4f7f-7ba38e81c75a/197189639050.jpg/600x600bb.jpg";
const RAUW_SAT =
  "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/99/0f/ef/990fefcb-db12-0cf0-90f9-44115c095c73/196589764720.jpg/600x600bb.jpg";
const RAUW_VICE =
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/58/13/c3/5813c326-a7fa-f792-77e1-8310d9c80742/886449738724.jpg/600x600bb.jpg";
const RAUW_COSA =
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ab/e8/09/abe8092d-ef44-61b9-6b50-ab7efb78ca51/196872401516.jpg/600x600bb.jpg";

const SPOTIFY_ARTIST_BAD_BUNNY = "/artists/bad-bunny.jpg";
const SPOTIFY_ARTIST_MORA = "/artists/mora.jpg";
const SPOTIFY_ARTIST_RAUW = "/artists/rauw-alejandro.jpg";

function song(partial) {
  return {
    source: "seed",
    featuredArtistIds: [],
    genreIds: ["reggaeton"],
    ...partial,
  };
}

export const seedCatalog = {
  artists: [
    {
      id: "bad-bunny",
      name: "Bad Bunny",
      image: SPOTIFY_ARTIST_BAD_BUNNY,
      genreIds: ["reggaeton", "urbano", "trap"],
      spotifyUrl: "https://open.spotify.com/artist/4q3ewBCX7sLwd24euqV69X",
    },
    {
      id: "mora",
      name: "Mora",
      image: SPOTIFY_ARTIST_MORA,
      genreIds: ["reggaeton", "urbano", "trap"],
      spotifyUrl: "https://open.spotify.com/artist/0eHQ9ooISFiBijPNirAwWW",
    },
    {
      id: "rauw-alejandro",
      name: "Rauw Alejandro",
      image: SPOTIFY_ARTIST_RAUW,
      genreIds: ["reggaeton", "urbano", "pop-latino", "pop"],
      spotifyUrl: "https://open.spotify.com/artist/1mcTU8FS7v9JeuOY0vYRiB",
    },
  ],
  genres: [
    { id: "reggaeton", name: "Reggaetón" },
    { id: "urbano", name: "Urbano Latino" },
    { id: "trap", name: "Trap Latino" },
    { id: "pop-latino", name: "Pop Latino" },
    { id: "pop", name: "Pop" },
  ],
  albums: [
    { id: "un-verano-sin-ti", name: "Un Verano Sin Ti", artistId: "bad-bunny", year: 2022, image: BB_VERANO },
    { id: "yhlqmdlg", name: "YHLQMDLG", artistId: "bad-bunny", year: 2020, image: BB_YHL },
    { id: "dtmf", name: "DeBÍ TiRAR MáS FOToS", artistId: "bad-bunny", year: 2025, image: BB_DTMF },
    { id: "el-ultimo-tour", name: "EL ÚLTIMO TOUR DEL MUNDO", artistId: "bad-bunny", year: 2020, image: BB_YHL },
    { id: "microdosis", name: "MICRODOSIS", artistId: "mora", year: 2022, image: MORA_MICRO },
    { id: "estrella", name: "ESTRELLA", artistId: "mora", year: 2023, image: MORA_ESTRELLA },
    { id: "saturno", name: "SATURNO", artistId: "rauw-alejandro", year: 2022, image: RAUW_SAT },
    { id: "vice-versa", name: "VICE VERSA", artistId: "rauw-alejandro", year: 2021, image: RAUW_VICE },
    { id: "cosa-nuestra", name: "Cosa Nuestra", artistId: "rauw-alejandro", year: 2024, image: RAUW_COSA },
    {
      id: "rr-single",
      name: "RR",
      artistId: "rauw-alejandro",
      year: 2023,
      image:
        "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/b0/e4/ac/b0e4ac99-eb38-7370-ea50-0bcf0bcbb054/196589949080.jpg/600x600bb.jpg",
    },
  ],
  playlists: [
    {
      id: "hits-verano",
      name: "Hits de verano",
      description: "Clásicos de Un Verano Sin Ti",
      image: BB_VERANO,
      trackIds: ["bb-neverita", "bb-ojitos", "bb-playa", "bb-ensenam", "bb-vacaciones", "bb-verano"],
    },
    {
      id: "mora-essentials",
      name: "Mora essentials",
      description: "MICRODOSIS + ESTRELLA",
      image: MORA_MICRO,
      trackIds: ["mora-escalofrios", "mora-memorias", "mora-badtrip", "mora-media-luna", "mora-pasajero"],
    },
    {
      id: "rauw-classics",
      name: "Rauw classics",
      description: "SATURNO, VICE VERSA y más",
      image: RAUW_SAT,
      trackIds: ["rauw-saturno", "rauw-nubes", "rauw-desenfocao", "rauw-beso", "rauw-lejos"],
    },
    {
      id: "urbano-2020s",
      name: "Urbano 2020s",
      description: "Mezcla 2020–2025",
      image: BB_DTMF,
      trackIds: [
        "bb-si-veo",
        "bb-neverita",
        "mora-memorias",
        "rauw-nubes",
        "bb-nuevayol",
        "rauw-tu-con-el",
      ],
    },
  ],
  songs: [
    song({
      id: "bb-verano",
      title: "Un Verano Sin Ti",
      artistId: "bad-bunny",
      albumId: "un-verano-sin-ti",
      year: 2022,
      image: BB_VERANO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/29/21/aa/2921aa77-0a9b-4771-a6e9-2db85f177444/mzaf_11940520242658716528.plus.aac.p.m4a",
      aliases: ["un verano sin ti"],
    }),
    song({
      id: "bb-neverita",
      title: "Neverita",
      artistId: "bad-bunny",
      albumId: "un-verano-sin-ti",
      year: 2022,
      image: BB_VERANO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/23/26/dd/2326dd0b-f117-306c-8454-be8934ffb402/mzaf_18297346266039659444.plus.aac.p.m4a",
    }),
    song({
      id: "bb-ojitos",
      title: "Ojitos Lindos",
      artistId: "bad-bunny",
      featuredArtistIds: [],
      albumId: "un-verano-sin-ti",
      year: 2022,
      image: BB_VERANO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/72/ae/81/72ae81c2-4ef3-b998-40b6-563c0609509f/mzaf_12868850384306577273.plus.aac.p.m4a",
    }),
    song({
      id: "bb-playa",
      title: "Después de la Playa",
      artistId: "bad-bunny",
      albumId: "un-verano-sin-ti",
      year: 2022,
      image: BB_VERANO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f6/c6/a0/f6c6a092-1690-3328-907d-280a8ba6adac/mzaf_4195200870757777362.plus.aac.p.m4a",
      aliases: ["despues de la playa"],
    }),
    song({
      id: "bb-ensenam",
      title: "Enséñame a Bailar",
      artistId: "bad-bunny",
      albumId: "un-verano-sin-ti",
      year: 2022,
      image: BB_VERANO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/d2/5c/bc/d25cbc2c-9333-e77b-116b-97aa3df37dbd/mzaf_17984155223864039749.plus.aac.p.m4a",
      aliases: ["ensenam a bailar", "ensename a bailar"],
    }),
    song({
      id: "bb-vacaciones",
      title: "Me Fui de Vacaciones",
      artistId: "bad-bunny",
      albumId: "un-verano-sin-ti",
      year: 2022,
      image: BB_VERANO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a9/1a/db/a91adb07-ba1b-4560-b1f1-961fec8654dc/mzaf_8216769890898312299.plus.aac.p.m4a",
    }),
    song({
      id: "bb-si-veo",
      title: "Si Veo a Tu Mamá",
      artistId: "bad-bunny",
      albumId: "yhlqmdlg",
      year: 2020,
      image: BB_YHL,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/b3/cd/a2/b3cda27f-382a-ed21-b6b9-2d6d1d4c5bbe/mzaf_15368178672903748165.plus.aac.p.m4a",
      aliases: ["si veo a tu mama"],
    }),
    song({
      id: "bb-merced",
      title: "A Tu Merced",
      artistId: "bad-bunny",
      albumId: "yhlqmdlg",
      year: 2020,
      image: BB_YHL,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/17/ec/ef/17eceff9-59e2-3dbc-2395-eb83903b7d03/mzaf_3226979305489942701.plus.aac.p.m4a",
    }),
    song({
      id: "bb-258",
      title: "25/8",
      artistId: "bad-bunny",
      albumId: "yhlqmdlg",
      year: 2020,
      image: BB_YHL,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/9a/36/f2/9a36f259-8848-2071-4c41-4824e67a495b/mzaf_14902156511595530735.plus.aac.p.m4a",
      aliases: ["25 8", "veinticinco ocho"],
    }),
    song({
      id: "bb-ya-no",
      title: "Pero Ya No",
      artistId: "bad-bunny",
      albumId: "yhlqmdlg",
      year: 2020,
      image: BB_YHL,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/88/4c/8e/884c8ebc-c213-4f9e-2ebc-22b748d66fff/mzaf_6660624276214368078.plus.aac.p.m4a",
    }),
    song({
      id: "bb-nuevayol",
      title: "NUEVAYoL",
      artistId: "bad-bunny",
      albumId: "dtmf",
      year: 2025,
      image: BB_DTMF,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/2e/97/55/2e97555a-1ed3-9e07-de57-07e1213186c9/mzaf_7594924455925081680.plus.aac.p.m4a",
      aliases: ["nuevayol", "nueva yol"],
    }),
    song({
      id: "bb-noche",
      title: "LA NOCHE DE ANOCHE",
      artistId: "bad-bunny",
      albumId: "el-ultimo-tour",
      year: 2020,
      image: BB_YHL,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/e1/68/7d/e1687dbd-9fa8-6330-f8bc-9f2d539ab039/mzaf_6426845985048084789.plus.aac.p.m4a",
      aliases: ["la noche de anoche"],
    }),
    song({
      id: "mora-escalofrios",
      title: "ESCALOFRÍOS",
      artistId: "mora",
      albumId: "microdosis",
      year: 2022,
      image: MORA_MICRO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/58/0a/9b/580a9b5d-510c-5ad4-8000-9fc62af0f4f3/mzaf_5160120078046007974.plus.aac.p.m4a",
      aliases: ["escalofrios"],
    }),
    song({
      id: "mora-badtrip",
      title: "badtrip :(",
      artistId: "mora",
      albumId: "microdosis",
      year: 2022,
      image: MORA_MICRO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/65/1e/cf/651ecf2b-fdec-7556-416a-096cb1f50f27/mzaf_4845566952747589466.plus.aac.p.m4a",
      aliases: ["badtrip", "bad trip"],
    }),
    song({
      id: "mora-pecado",
      title: "PECADO",
      artistId: "mora",
      albumId: "microdosis",
      year: 2022,
      image: MORA_MICRO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/0f/51/ab/0f51abf6-bd91-af2b-e7e1-799a3f6d54d1/mzaf_15482097358638419341.plus.aac.p.m4a",
    }),
    song({
      id: "mora-ojos",
      title: "OJOS COLORAU",
      artistId: "mora",
      albumId: "microdosis",
      year: 2022,
      image: MORA_MICRO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/d2/27/4d/d2274da4-a500-fa73-9690-53dd7b06a5ec/mzaf_18265917791897288549.plus.aac.p.m4a",
    }),
    song({
      id: "mora-memorias",
      title: "MEMORIAS",
      artistId: "mora",
      albumId: "microdosis",
      year: 2022,
      image: MORA_MICRO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/aa/a7/ec/aaa7ec7c-ef26-ff55-e3f0-41e95c8c419e/mzaf_7845428154904821468.plus.aac.p.m4a",
    }),
    song({
      id: "mora-lejos",
      title: "LEJOS DE TI",
      artistId: "mora",
      albumId: "microdosis",
      year: 2022,
      image: MORA_MICRO,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/98/d4/f3/98d4f30d-6ae8-a557-86b6-da1135e76efb/mzaf_603059598773368476.plus.aac.p.m4a",
    }),
    song({
      id: "mora-media-luna",
      title: "MEDIA LUNA",
      artistId: "mora",
      albumId: "estrella",
      year: 2023,
      image: MORA_ESTRELLA,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/69/41/d2/6941d217-e429-76a4-cbdf-0022bdc75cea/mzaf_17098232230843226571.plus.aac.p.m4a",
    }),
    song({
      id: "mora-querer",
      title: "DONDE SE APRENDE A QUERER?",
      artistId: "mora",
      albumId: "estrella",
      year: 2023,
      image: MORA_ESTRELLA,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/2e/f7/83/2ef783e6-12ee-31e7-d837-552083a6ed10/mzaf_13901399736219003720.plus.aac.p.m4a",
      aliases: ["donde se aprende a querer"],
    }),
    song({
      id: "mora-pasajero",
      title: "PASAJERO",
      artistId: "mora",
      albumId: "estrella",
      year: 2023,
      image: MORA_ESTRELLA,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ab/cd/fc/abcdfc00-196f-1563-aacf-55fa6250bb34/mzaf_946837812915397019.plus.aac.p.m4a",
    }),
    song({
      id: "rauw-verde",
      title: "VERDE MENTA",
      artistId: "rauw-alejandro",
      albumId: "saturno",
      year: 2022,
      image: RAUW_SAT,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/73/e1/6d/73e16d19-3fce-8085-7ed9-2e7c97ed1ca8/mzaf_3801098750883343974.plus.aac.p.m4a",
    }),
    song({
      id: "rauw-lejos",
      title: "LEJOS DEL CIELO",
      artistId: "rauw-alejandro",
      albumId: "saturno",
      year: 2022,
      image: RAUW_SAT,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a6/d6/87/a6d687f1-1759-3489-b5c2-a1a4f3c43b58/mzaf_5681629621223807008.plus.aac.p.m4a",
    }),
    song({
      id: "rauw-saturno",
      title: "SATURNO",
      artistId: "rauw-alejandro",
      albumId: "saturno",
      year: 2022,
      genreIds: ["reggaeton", "urbano"],
      image: RAUW_SAT,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/97/1d/e3/971de379-7541-3110-e701-32e17d6b5660/mzaf_10809066254844724316.plus.aac.p.m4a",
    }),
    song({
      id: "rauw-nubes",
      title: "Nubes",
      artistId: "rauw-alejandro",
      albumId: "vice-versa",
      year: 2021,
      image: RAUW_VICE,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/d3/28/2c/d3282c1f-268f-c753-d288-5d643c87691b/mzaf_9081986131645779312.plus.aac.p.m4a",
    }),
    song({
      id: "rauw-cuando",
      title: "¿Cuándo Fue?",
      artistId: "rauw-alejandro",
      albumId: "vice-versa",
      year: 2021,
      image: RAUW_VICE,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/db/94/30db942e-30d5-569b-91ae-e75cdbd16a79/mzaf_6918036862829436534.plus.aac.p.m4a",
      aliases: ["cuando fue"],
    }),
    song({
      id: "rauw-desenfocao",
      title: "Desenfocao'",
      artistId: "rauw-alejandro",
      albumId: "vice-versa",
      year: 2021,
      image: RAUW_VICE,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/12/92/43/1292436d-e28c-f3ba-51eb-91ca2b4ea578/mzaf_15223671047978269981.plus.aac.p.m4a",
      aliases: ["desenfocao", "desenfocado"],
    }),
    song({
      id: "rauw-beso",
      title: "BESO",
      artistId: "rauw-alejandro",
      albumId: "rr-single",
      year: 2023,
      genreIds: ["pop-latino", "reggaeton"],
      image:
        "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/b0/e4/ac/b0e4ac99-eb38-7370-ea50-0bcf0bcbb054/196589949080.jpg/600x600bb.jpg",
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/74/ff/6a/74ff6a85-d80c-a6c8-9564-3b899cf29810/mzaf_15260083401754887244.plus.aac.p.m4a",
    }),
    song({
      id: "rauw-tu-con-el",
      title: "Tú Con Él",
      artistId: "rauw-alejandro",
      albumId: "cosa-nuestra",
      year: 2024,
      image: RAUW_COSA,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ab/8a/a5/ab8aa549-a0ee-9083-6953-093a56cc573c/mzaf_10969913427257276545.plus.aac.p.m4a",
      aliases: ["tu con el"],
    }),
    song({
      id: "rauw-khe",
      title: "Khé?",
      artistId: "rauw-alejandro",
      albumId: "cosa-nuestra",
      year: 2024,
      image: RAUW_COSA,
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/06/03/6e/06036e06-d980-1c42-1618-5f725a92876f/mzaf_9794012487077515499.plus.aac.p.m4a",
      aliases: ["khe", "que"],
    }),
    song({
      id: "rauw-tattoo",
      title: "Tattoo",
      artistId: "rauw-alejandro",
      albumId: "vice-versa",
      year: 2020,
      image:
        "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/38/16/47/38164723-5bde-a8a2-5b01-8786571db86b/886448596455.jpg/600x600bb.jpg",
      previewUrl:
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/35/39/d9/3539d9bb-a9eb-492b-71c3-e2a9ee4ad4bb/mzaf_11870500896650250561.plus.aac.p.m4a",
    }),
  ],
};

export function getSeedCatalog() {
  return seedCatalog;
}
