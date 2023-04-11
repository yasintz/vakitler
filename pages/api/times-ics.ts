import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import * as ics from "ics";
import { v5 as uuid } from "uuid";

const MY_NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";

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
function toEventDate(date: Date): ics.EventAttributes["start"] {
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
    uid: uuid(date.toISOString(), MY_NAMESPACE),
    start: toEventDate(date),
    end: toEventDate(
      DateTime.fromJSDate(date).plus({ minutes: 15 }).toJSDate()
    ),
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

export default async function handler(req: NextRequest, res: any) {
  const cityID = (req as any).query.cityID;

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

    res.setHeader("Cache-Control", `s-maxage=${86400 * 10}`);
    res.end(icsResponse);
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Something went wrong", { status: 500 });
  }
}
