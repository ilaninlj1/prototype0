import type { PickedFile } from './import-file.ts';

/**
 * Files broken on purpose, read by the real importer from Tune's Test import, so the error
 * handling can be shown on any phone without getting a bad file onto it. Nothing is saved.
 * The same files are in samples/ for trying the real file picker.
 */
export const IMPORT_SAMPLES: Record<'messy' | 'cutOff' | 'wrong', { label: string; files: PickedFile[] }> = {
  messy: {
    label: 'Messy list',
    files: [
      {
        name: 'messy_songs.csv',
        text: `Artist,Song,Date Added
Radiohead,Karma Police,2021-03-14
,Hyperballad,2021-04-02
Björk,,2021-04-02
Fleetwood Mac,Dreams,not a date
Frank Ocean,Nights,2021-13-45
Kendrick Lamar,Alright,2099-01-01
,,
Unknown Artist,Track 07,2020-05-01
Sade,Smooth Operator,05/06/2019
The Beatles,Blackbird,2018-08-30
the beatles,BLACKBIRD,2022-01-01
Stevie Wonder,Superstition,
Earth, Wind & Fire,September,2020-09-21
`,
      },
    ],
  },
  cutOff: {
    label: 'Cut off',
    files: [
      {
        name: 'StreamingHistory_music_0.json',
        text: `[
  {"endTime":"2023-01-05 14:33","artistName":"Sade","trackName":"Jezebel","msPlayed":324000},
  {"endTime":"2023-01-05 14:40","artistName":"Nina Simone","trackName":"Sinnerman","msPlayed":612000},
  {"endTime":"2023-01-05 14:41","artistName":"Daft Punk","trackName":"Around the World","msPlayed":4000},
  {"endTime":"2023-01-05 15:10","podcastName":"Song Exploder","episodeName":"Episode 200","msPlayed":1200000},
  {"endTime":"2023-01-05 15:20","artistName":"Al Green","trackName":"Love and Happiness","msPlayed":301000},
  {"endTime":"2023-01-05 15:26","artistName":"Prince","trackNa`,
      },
    ],
  },
  wrong: {
    label: 'Wrong file',
    files: [{ name: 'expenses.csv', text: 'date,amount,category\n2021-01-01,4.50,coffee\n2021-01-02,12.00,lunch\n' }],
  },
};
