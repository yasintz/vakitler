import { NextRequest } from "next/server";
import { DateTime } from "luxon";
import * as ics from "ics";

type EzanVaktiResponse = {
  Aksam: string;
  AyinSekliURL: string;
  GreenwichOrtalamaZamani: number;
  Gunes: string;
  GunesBatis: string;
  GunesDogus: string;
  HicriTarihKisa: string;
  HicriTarihKisaIso8601: null;
  HicriTarihUzun: string;
  HicriTarihUzunIso8601: null;
  Ikindi: string;
  Imsak: string;
  KibleSaati: string;
  MiladiTarihKisa: string;
  MiladiTarihKisaIso8601: string;
  MiladiTarihUzun: string;
  MiladiTarihUzunIso8601: string;
  Ogle: string;
  Yatsi: string;
};

function toDate(date: Date, time: string) {
  const [hour, minute] = time.split(":");

  const newDate = DateTime.fromJSDate(date).plus({
    hour: parseInt(hour, 10),
    minute: parseInt(minute, 10),
  });

  return newDate.toJSDate();
}
function toStart(date: Date): ics.EventAttributes["start"] {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ];
}

enum TimeEnum {
  Sobriety,
  Sunrise,
  Afternoon,
  MidAfternoon,
  Evening,
  Night,
}

const titleMapTR: Record<TimeEnum, string> = {
  [TimeEnum.Sobriety]: "Sabah Namazi",
  [TimeEnum.Sunrise]: "Gunes Dogusu",
  [TimeEnum.Afternoon]: "Ogle Namazi",
  [TimeEnum.MidAfternoon]: "Ikindi Namazi",
  [TimeEnum.Evening]: "Aksam Namazi",
  [TimeEnum.Night]: "Yatsi Namazi",
};

function toEvent(date: Date, time: TimeEnum) {
  const event: ics.EventAttributes = {
    start: toStart(date),
    duration: { hours: 0, minutes: 15 },
    title: titleMapTR[time],
    status: "CONFIRMED",
    busyStatus: "BUSY",
  };

  return event;
}

function createEventsPromise(events: ics.EventAttributes[]) {
  return new Promise<string>((res, rej) => {
    ics.createEvents(events, (error, value) => {
      if (error) {
        rej(error);
        return;
      } else {
        res(value);
      }
    });
  });
}

export const config = {
  runtime: "edge",
};

export default async function handler(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cityID = params.get("cityID");

  try {
    if (!cityID) {
      return new Response("Missing parameters", { status: 400 });
    }

    const url = new URL(`/vakitler/${cityID}`, process.env.API_URL);

    const response = await fetch(url, {
      headers: { "x-parola": process.env.API_PASS! },
    });
    const data: EzanVaktiResponse[] = await response.json();

    const eventsByDay = data.map(time => {
      const initialDate = new Date(time.MiladiTarihUzunIso8601);

      return [
        toEvent(toDate(initialDate, time.Imsak), TimeEnum.Sobriety),
        toEvent(toDate(initialDate, time.Gunes), TimeEnum.Sunrise),
        toEvent(toDate(initialDate, time.Ogle), TimeEnum.Afternoon),
        toEvent(toDate(initialDate, time.Ikindi), TimeEnum.MidAfternoon),
        toEvent(toDate(initialDate, time.Aksam), TimeEnum.Evening),
        toEvent(toDate(initialDate, time.Yatsi), TimeEnum.Night),
      ];
    });

    const events = eventsByDay.reduce((acc, cur) => {
      acc.push(...cur);
      return acc;
    }, [] as ics.EventAttributes[]);

    const icsResponse = await createEventsPromise(events);

    return new Response(icsResponse, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=172800", // 2 days
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Something went wrong", { status: 500 });
  }
}
