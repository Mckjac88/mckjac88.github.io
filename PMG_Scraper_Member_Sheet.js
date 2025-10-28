/* Constants */
// Constants for storing and accessing APIs
window.memberStorageKey = "NCRM_MEMBERS";
window.memberLastUpdatedKey = "NCRM_MEMBERS_LAST_UPDATED";
window.prosAreaUrl = `/services/mission/prosArea`;
window.dotUrl = `/services/people/primary`;
window.memberUrl = `/services/progress/timeline`;

// Global Variables
window.members = JSON.parse(localStorage.getItem(memberStorageKey)) ?? [];
window.areaMembers = {};
window.householdMembers = {};
window.memberTimelines = {};
window.memberLastUpdated =
  JSON.parse(localStorage.getItem(memberLastUpdatedKey)) ?? {};

// Display Adjustments
window.activethresholds = {
  successful: Date.now() - 2628000000 * 24, // Second number is months
  attempted: Date.now() - 2628000000 * 24, // Second number is months
};

/* Setup Fake Root */
function buildFakeRoot() {
  var newRoot = document.createElement("div");
  newRoot.id = "new-root";
  newRoot.style.height = "100%";
  newRoot.style.width = "100vw";
  newRoot.style.overflowY = "auto";
  newRoot.style.zIndex = 5000;
  newRoot.style.position = "absolute";
  newRoot.style.backgroundColor = "white";
  document.body.insertBefore(newRoot, document.body.children[0]);
  var bodyChildNodes = [...document.body.children];
  bodyChildNodes.forEach((c, i) => {
    if (i === 0) return;
    document.body.removeChild(c);
  });
  newRoot.style.zIndex = 1;
  return newRoot;
}

function householdAssignment(members) {
  const byLastName = {};
  const adultsByLastName = {};
  const byCommonLastName = {};
  // Map all members and adults
  members.filter((m) => m.ageCategoryId >= 30);
  members.forEach((m) => {
    if (!byLastName[m.lastName]) byLastName[m.lastName] = [m];
    else byLastName[m.lastName].push(m);
    if (m.ageCategoryId < 30) return;
    if (!adultsByLastName[m.lastName]) adultsByLastName[m.lastName] = [m];
    else adultsByLastName[m.lastName].push(m);
  });

  // Find most common adult names, example: [Name1: 3, Name2: 3] (Name3 only had 2 so we removed it)
  const mostCommonAdultNameCount = Math.max(
    ...Object.values(adultsByLastName).map((a) => a.length),
  );
  const mostCommonAdultNames = Object.keys(adultsByLastName).filter(
    (k) => adultsByLastName[k].length === mostCommonAdultNameCount,
  );

  // If there's only one most common adult name, that's our boy
  if (mostCommonAdultNames.length === 1)
    return (mostCommonAdultNames[0]);

  // Map the members appropriately and find the most common names including children
  Object.keys(byLastName)
    .filter((ln) => mostCommonAdultNames.includes(ln))
    .forEach((n) => (byCommonLastName[n] = byLastName[n]));
  const mostCommonNameCount = Math.max(
    ...Object.values(byCommonLastName).map((a) => a.length),
  );
  const mostCommonNames = Object.keys(byCommonLastName).filter(
    (k) => byCommonLastName[k].length === mostCommonNameCount,
  );
  // If there's one with the most children, return that one
  if (mostCommonNames.length === 1) return (mostCommonNames[0]);
  const oldestCommonMembers = mostCommonNames
    .map((n) => byCommonLastName[n])
    .flat(2)
    .sort((m) => m.ageCategoryId);
  const oldestMaleMembers = oldestCommonMembers.filter((m) => m.gender === "M");
  // Return the oldest adult male or the oldest female
  if (oldestMaleMembers.length !== 0)
    return (householdNames = oldestMaleMembers[0].lastName);
  return (householdNames = oldestCommonMembers[0].lastName);
}

function getRandomColor() {
  var letters = "0123456789ABCDEF";
  var color = "#";
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function parseJwt(token) {
  var base64Url = token.split(".")[1];
  var base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  var jsonPayload = decodeURIComponent(
    window
      .atob(base64)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join(""),
  );

  return JSON.parse(jsonPayload);
}

async function updateMembers(log) {
  if (log) console.log("Fetching People...");
  const jwtToken = JSON.parse(sessionStorage.getItem("userData")).token;
  const { companions, areaId } = parseJwt(jwtToken);
  const areaDetails = await fetch(`${prosAreaUrl}/${areaId}`).then((r) =>
    r.json(),
  );
  const dots = await fetch(
    `${dotUrl}?stewardCmisIds=${companions.join(",")}`,
  ).then((r) => r.json());

  const { assignmentOrgs } = areaDetails;
  const memberData = dots.persons.filter(
    (p) =>
      assignmentOrgs.includes(p.orgId) &&
      (p.personStatusId === 40 || p.cmisId !== null),
  );
  localStorage.setItem(memberStorageKey, JSON.stringify(memberData));
  if (log) console.log("Done Updating People");
  members = memberData;
}

function updateAreaMembers(memberList) {
  const orgs = [...new Set(memberList.map((m) => m.orgName))];
  const membersByArea = {};
  for (var o of orgs) {
    membersByArea[o] = memberList.filter((m) => m.orgName === o);
  }
  areaMembers = membersByArea;
}

function updateHouseholdMembers(memberList) {
  const hm = {};
  memberList.forEach((m) => {
    if (!Object.keys(hm).includes(m.householdGuid)) hm[m.householdGuid] = {};
    hm[m.householdGuid].color = getRandomColor();
    if (!hm[m.householdGuid].members) hm[m.householdGuid].members = [];
    hm[m.householdGuid].members.push({
      personGuid: m.personGuid,
      name: m.firstName + (m.lastName ? ` ${m.lastName}` : ""),
      lastName: m.lastName ? m.lastName : "NO LASTNAME",
    });
  });
  for (var h in hm) {
    hm[h].members[0].lastName = householdAssignment(hm[h].members);
    hm[h].commonMember = hm[h].members[0];
  }
  const assignedLastNames = Object.values(hm).map(
    ({ commonMember: cm }) => cm.lastName,
  );
  var commonLastNames;
  for (var h in hm) {
    commonLastNames = assignedLastNames.filter(
      (n) => n === hm[h].commonMember.lastName,
    );
    if (commonLastNames.length === 1) continue;
    commonLastNames.forEach(
      (ln, i) =>
        (hm[
          Object.keys(hm).find((hk) => hm[hk].commonMember.lastName === ln)
        ].commonMember.lastName += ` ${i + 1}`),
    );
  }

  householdMembers = hm;
}

function renderComponent(props) {
  const tag = props.tag ?? "div";
  const e = document.createElement(tag);
  if (props.children)
    for (var c of props.children) if (c) e.appendChild(renderComponent(c));
  for (var k in props) e[k] = props[k];
  return e;
}

async function updateMemberTimelines(members) {
  const startTime = Date.now();
  const timelineList = members.map((m) =>
    fetch(`${memberUrl}/${m.personGuid}`)
      .then((r) => r.json())
      .then((tl) => ({ ...m, timeline: tl })),
  );
  const memberTimelineList = await Promise.all(timelineList);
  for (var m of memberTimelineList) memberTimelines[m.personGuid] = m.timeline;
  const endTime = Date.now();
  console.log(
    `Pulled ${timelineList.length} timelines in ${
      (endTime - startTime) / 1000
    }s`,
  );
  console.log("Timelines Updated!");
}

async function updateMemberLastUpdated(members) {
  var mContacts;
  var currentTime = Date.now();
  for (var m of members) {
    mContacts = (memberTimelines[m.personGuid] ?? [])
      .filter(
        (e) =>
          e.timelineItemType === "CONTACT" || e.timelineItemType === "TEACHING",
      )
      .sort((a, b) => b.itemDate - a.itemDate);
    dnContacts = (memberTimelines[m.personGuid] ?? [])
      .filter((e) => e.timelineItemType === "DO_NOT_CONTACT")
      .sort((a, b) => b.itemDate - a.itemDate);
    const lastSuccessful = mContacts.find((e) => e.eventStatus === true) ?? {};
    const lastAttempted =
      mContacts.find(
        (e) => e.eventStatus === true || e.eventStatus === false,
      )
      ?? {};
    const nextPlanned =
      mContacts
        .sort((a, b) => a.itemDate - b.itemDate)
        .find((e) => e.itemDate > currentTime) ?? {};
    const doNotContact = dnContacts[0] ?? {};
    const lsDate = lastSuccessful.itemDate
      ? new Date(lastSuccessful.itemDate)
      : 0;
    const laDate = lastAttempted.itemDate
      ? new Date(lastAttempted.itemDate)
      : 0;

    memberLastUpdated[m.personGuid] = {
      lastSuccessful,
      lastAttempted,
      nextPlanned,
      lsDate,
      laDate,
      lsTimestamp: lastSuccessful.itemDate,
      laTimestamp: lastAttempted.itemDate,
      npTimestamp: nextPlanned.itemDate,
      dncTimestamp: doNotContact.itemDate,
    };
  }
  localStorage.setItem(memberLastUpdatedKey, JSON.stringify(memberLastUpdated));
}

function MemberBox(props) {
  const { member: m, openDetailed, close } = props;
  const fullName = `${m.firstName} ${m.lastName ?? ""}`;
  const datefmt = (d) =>
    d === 0
      ? "Not Recorded"
      : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  function getAttemptedColor() {
    if (!memberLastUpdated[m.personGuid]) return "orange";
    if (!memberLastUpdated[m.personGuid].laTimestamp) return "black";
    return memberLastUpdated[m.personGuid].laTimestamp >
      activethresholds.attempted
      ? "green"
      : "red";
  }

  function getSuccessfulColor() {
    if (!memberLastUpdated[m.personGuid]) return "orange";
    if (!memberLastUpdated[m.personGuid].lsTimestamp) return "black";
    return memberLastUpdated[m.personGuid].lsTimestamp >
      activethresholds.successful
      ? "green"
      : "red";
  }

  function alertLastSuccessfulContact() {
    if (!memberLastUpdated[m.personGuid]) return alert("Not Available");
    const { lastSuccessful, lsTimestamp } = memberLastUpdated[m.personGuid];
    const { lessonReview: lr, lessonPlan: lp } = lastSuccessful ?? {};
    const dateInfo = lsTimestamp
      ? datefmt(new Date(lsTimestamp))
      : "No Successful Contact!";
    const display = [fullName, dateInfo, lr ?? lp ?? "No Details"].join("\n");
    alert(display);
  }

  function alertLastAttemptedContact() {
    if (!memberLastUpdated[m.personGuid]) return alert("Not Available");
    const { lastAttempted, laTimestamp } = memberLastUpdated[m.personGuid];
    const { lessonReview: lr, lessonPlan: lp } = lastAttempted ?? {};
    const dateInfo = laTimestamp
      ? datefmt(new Date(laTimestamp))
      : "Never been Contacted!";
    const display = [fullName, dateInfo, lr ?? lp ?? "No Details"].join("\n");
    alert(display);
  }

  return {
    className: `org-member ${(m.gender ?? "u").toLowerCase()}`,
    style: "display: flex; flex-wrap: wrap;",
    children: [
      {
        tag: "div",
        style: "display:flex; height: 12px; width: 100%;",
        children: /*
          householdMembers[m.householdGuid].members.length === 1
            ? []
            : */ [
          {
            tag: "span",
            style: `width:12px; height: 12px; background-color: ${
              householdMembers[m.householdGuid].color
            }; display: block; margin-right:2px;`,
          },
          {
            tag: "p",
            innerText: householdMembers[m.householdGuid].commonMember.lastName,
            style: "font-size: .65rem; margin: auto;",
          },
        ],
      },
      {
        tag: "h6",
        innerText: `${m.firstName} ${m.lastName ?? ""}`,
        style: "font-size: 1rem; color: inherit; margin: auto",
      },

      {
        tag: "div",
        className: "org-member-data",
        children: [
          {
            tag: m.phone ? "a" : "p",
            innerText: m.phone
              ? m.phone
                  .replaceAll("-", "")
                  .replaceAll("+", "")
                  .replaceAll(" ", "")
              : "No Phone",
            href: m.phone
              ? `tel:+1${m.phone
                  .replaceAll("-", "")
                  .replaceAll("+", "")
                  .replaceAll(" ", "")}`
              : null,
          },
          {
            tag: m.address ? "a" : "p",
            href: m.address
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  m.address,
                )}`
              : null,
            innerText: m.address ?? "No Address",
          },
        ],
      },
      {
        tag: "div",
        style:
          "display:flex; align-items: center; height: 1rem; margin-top: auto; width: 100%; justify-content: flex-start; gap: .5rem;",
        className: "org-member-actions",
        children: [
          {
            tag: "a",
            href: `https://referralmanager.churchofjesuschrist.org/person/${m.personGuid}`,
            innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-compass" viewBox="0 0 16 16"> <path d="M8 16.016a7.5 7.5 0 0 0 1.962-14.74A1 1 0 0 0 9 0H7a1 1 0 0 0-.962 1.276A7.5 7.5 0 0 0 8 16.016zm6.5-7.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z"/> <path d="m6.94 7.44 4.95-2.83-2.83 4.95-4.949 2.83 2.828-4.95z"/> </svg>`,
            style: "color: #eb345e; font-size: 1rem;",
            title: "Link to Person in PMG",
          },
          {
            tag: "a",
            style: "color: #232323; font-size: 1rem;",
            innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="18" height="18"><!--! Font Awesome Free 6.1.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2022 Fonticons, Inc. --><path d="M224 256c70.7 0 128-57.31 128-128S294.7 0 224 0C153.3 0 96 57.31 96 128S153.3 256 224 256zM274.7 304H173.3c-95.73 0-173.3 77.6-173.3 173.3C0 496.5 15.52 512 34.66 512H413.3C432.5 512 448 496.5 448 477.3C448 381.6 370.4 304 274.7 304zM479.1 320h-73.85C451.2 357.7 480 414.1 480 477.3C480 490.1 476.2 501.9 470 512h138C625.7 512 640 497.6 640 479.1C640 391.6 568.4 320 479.1 320zM432 256C493.9 256 544 205.9 544 144S493.9 32 432 32c-25.11 0-48.04 8.555-66.72 22.51C376.8 76.63 384 101.4 384 128c0 35.52-11.93 68.14-31.59 94.71C372.7 243.2 400.8 256 432 256z"/></svg>`,
            title: "Open Detailed View",
            onclick: openDetailed,
          },
          {
            tag: "a",
            style: "color: #232323; font-size: 1rem;",
            innerHTML: `<svg fill="white" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
	 width="18px" height="18px" style="border-radius: 100%;background-color:${getAttemptedColor()};" viewBox="0 0 305.002 305.002"
	 xml:space="preserve">
<g>
	<g>
		<path d="M170.18,152.5l43.13-43.129c4.882-4.882,4.882-12.796,0-17.678c-4.881-4.882-12.796-4.881-17.678,0l-43.13,43.13
			l-43.131-43.131c-4.882-4.881-12.796-4.881-17.678,0c-4.881,4.882-4.881,12.796,0,17.678l43.13,43.13l-43.131,43.131
			c-4.881,4.882-4.881,12.796,0,17.679c2.441,2.44,5.64,3.66,8.839,3.66c3.199,0,6.398-1.221,8.839-3.66l43.131-43.132
			l43.131,43.132c2.441,2.439,5.64,3.66,8.839,3.66s6.398-1.221,8.839-3.66c4.882-4.883,4.882-12.797,0-17.679L170.18,152.5z"/>
	</g>
</g>
</svg>`,
            title: "View Last Attempted",
            onclick: alertLastAttemptedContact,
          },
          {
            tag: "a",
            style: "color: #232323; font-size: 1rem;",
            innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="18px" zoomAndPan="magnify" viewBox="0 0 30 30.000001" height="18px" preserveAspectRatio="xMidYMid meet" version="1.0" style="background-color:${getSuccessfulColor()};border-radius:100%;border-width:2px;border-style:solid;border-color:${getSuccessfulColor()};"><defs><clipPath id="id1"><path d="M 2.328125 4.222656 L 27.734375 4.222656 L 27.734375 24.542969 L 2.328125 24.542969 Z M 2.328125 4.222656 " clip-rule="nonzero"/></clipPath></defs><g clip-path="url(#id1)"><path fill="white" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125 " fill-opacity="1" fill-rule="nonzero"/></g></svg>`,
            title: "View Last Successful",
            onclick: alertLastSuccessfulContact,
          },
        ],
      },
    ],
  };
}

const separator = "§";
const ageValues = {
  10: "0-8",
  15: "9-11",
  20: "12-17",
  30: "18-30",
  40: "31-45",
  50: "46-59",
  60: "60+",
};

const exportItems = {
  household: {
    title: "Household Name",
    port: (members) =>
      members.map(
        (m) => householdMembers[m.householdGuid].commonMember.lastName,
      ),
  },
  name: {
    title: "Name",
    port: (members) => members.map((m) => `${m.firstName} ${m.lastName}`),
  },
  age: {
    title: "Age Range",
    port: (members) =>
      members.map((m) =>
        m.ageCategoryId != null
          ? JSON.stringify(m.ageCategoryId).replace(
              /10|15|20|30|40|50|60/g,
              (v) => ageValues[v],
            )
          : m.ageCategoryId,
      ),
  },
  gender: {
    title: "Gender",
    port: (members) => members.map((m) => m.gender),
  },
  sheetLastUpdated: {
    title: "Date Updated",
    port: (members) =>
      members.map((m) => {
        var d = new Date();
        return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      }),
  },
  notes: {
    title: "Notes",
    port: (members) =>
      members.map((m) =>
        (memberTimelines[m.personGuid] ?? [])
          .filter((e) => e.timelineItemType === "PERSON_PLN_NOTE")
          .sort((a, b) => b.itemDate - a.itemDate)
          .map((e) => e.lessonPlan.trim())
          .join("\n"),
      ),
  },
  nextPlannedNote: {
    title: "Next Move",
    port: (members) =>
      members.map((m) => {
        const { npTimestamp } = memberLastUpdated[m.personGuid];
        if (!npTimestamp) return "";
        const { laTimestamp } = memberLastUpdated[m.personGuid];
        var d = new Date(npTimestamp);
        if (npTimestamp == laTimestamp) return ``;
        const { nextPlanned } = memberLastUpdated[m.personGuid];
        const { lessonReview: lr, lessonPlan: lp } = nextPlanned ?? {};
        var npcn = lr ?? lp ?? "";
        return `${
          d.getMonth() + 1
        }/${d.getDate()}/${d.getFullYear()}: ${npcn.trim()}`;
      }),
  },
  lastAttemptedNote: {
    title: "Last Attempted Contact",
    port: (members) =>
      members.map((m) => {
        const { laTimestamp } = memberLastUpdated[m.personGuid];
        if (!laTimestamp) return "Never";
        const { lsTimestamp } = memberLastUpdated[m.personGuid];
        var d = new Date(laTimestamp);
        if (laTimestamp == lsTimestamp)
          return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
        const { lastAttempted } = memberLastUpdated[m.personGuid];
        const { lessonReview: lr, lessonPlan: lp } = lastAttempted ?? {};
        var lacn = lr ?? lp ?? "";
        return `${
          d.getMonth() + 1
        }/${d.getDate()}/${d.getFullYear()}: ${lacn.trim()}`;
      }),
  },
  lastSuccessfulNote: {
    title: "Last Succesful Contact",
    port: (members) =>
      members.map((m) => {
        const { lsTimestamp } = memberLastUpdated[m.personGuid];
        if (!lsTimestamp) return "Never";
        var d = new Date(lsTimestamp);
        const { lastSuccessful } = memberLastUpdated[m.personGuid];
        const { lessonReview: lr, lessonPlan: lp } = lastSuccessful ?? {};
        var lscn = lr ?? lp ?? "";
        return `${
          d.getMonth() + 1
        }/${d.getDate()}/${d.getFullYear()}: ${lscn.trim()}`;
      }),
  },
  doNotContacts: {
    title: "Do Not Contact",
    port: (members) =>
      members.map((m) => {
        const { dncTimestamp } = memberLastUpdated[m.personGuid];
        if (!dncTimestamp) return "";
        var d = new Date(dncTimestamp);
        return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      }),
  },
};

async function exportPrompt(col, members) {
  var items;
  if (!col.port) items = members.map(() => "");
  else items = col.port(members).join(separator);
  if (items.length > 50000) {
    console.log(items);
    await navigator.clipboard.writeText(items.slice(0, 49900));
    alert(
      `Unfortunately, the data for ${col.title} exceeds the Google Sheets character limit of 50,000 (${items.length}) so not all of the data will be exported. The full data has been logged to the console`,
    );
    await new Promise((s) => setTimeout(() => s(), 10));
    return;
  }
  await navigator.clipboard.writeText(items);
  alert(
    "Data copied to clipboard!\nPaste the data in the cell below " + col.title,
  );
  await new Promise((s) => setTimeout(() => s(), 10));
}

async function dataExport(orgMembers) {
  navigator.permissions
    .query({ name: "clipboard-write" })
    .then(async (result) => {
      if (result.state !== "granted" && result.state !== "prompt")
        return alert("Please Enable Clipboard Access!");
      console.log(result.state);
      for (var k in exportItems) await exportPrompt(exportItems[k], orgMembers);
    })
    .catch((e) => console.log(e));
}

function ExportButton(props) {
  const { orgMembers } = props;
  function exportData() {
    dataExport(orgMembers);
  }

  return {
    tag: "div",
    style:
      "display: flex; flex-wrap: wrap; height: 2rem;width:100%-2rem;justify-content:center;margin:2rem;",
    className: "member-details-actions",
    children: [
      {
        tag: "button",
        onclick: exportData,
        innerText: `Export ${orgMembers[0].orgName} To Sheet`,
      },
    ],
  };
}

function MemberDetailCard(props) {
  const { header, cards, smallBreak } = props;
  const compactMode = smallBreak ?? false;

  const cardDisplay = cards.map((c) => ({
    tag: "div",
    style:
      "display: flex; flex-wrap: wrap; margin: auto; text-align: left; max-width: 512px;background-color:rgba(0,0,0,.04);padding:1rem;width:100%;",
    children: [
      {
        tag: "h3",
        style: `${compactMode ? "" : "width:100%;"}margin:0;font-weight:bold;${
          compactMode ? "margin-right:.5rem;" : ""
        }`,
        innerText: c.title,
      },
      {
        tag: "p",
        innerText: c.detail,
        style: `${compactMode ? "margin: 0;" : ""}`,
      },
    ],
  }));

  return {
    style:
      "display: flex;flex-wrap: wrap; margin: auto; text-align: left; max-width: 512px;margin-bottom:2rem;width:100%;",
    children: [
      { tag: "h2", innerText: header },
      ...(cards.length === 0
        ? [{ tag: "h3", innerText: "Not Found!", style: "width:100%;" }]
        : cardDisplay),
    ],
  };
}

function MemberTimelineData(props = {}) {
  const { member, family } = props;

  const lastUpdated = memberLastUpdated[member.personGuid];
  const familyLastContacts = family.map((fm)=>memberLastUpdated[fm.personGuid]);
  const { lastSuccessful, lastAttempted }= memberLastUpdated[member.personGuid];
  
  const lastFamilySuccessfulUpdate = familyLastContacts.sort((mlu)=>mlu.lsDate)[0] ?? lastUpdated;
  const lastFamilyAttemptedUpdate = familyLastContacts.sort((mlu)=>mlu.laDate)[0] ?? lastUpdated;
  const lsDate = lastUpdated.lsDate ?? 0;
  const laDate = lastUpdated.laDate ?? 0;

  const lastFamilySuccessful = lastFamilySuccessfulUpdate.lastSuccessful ?? {};
  const lastFamilyAttempted = lastFamilyAttemptedUpdate.lastAttempted ?? {};
  const familyNotes = (family)
    .map((fm) =>
      fm.timeline.map((e) => ({
        ...e,
        memberName: `${fm.firstName} ${fm.lastName ?? ""}`,
      })),
    )
    .flat(2)
    .filter((e) => e.timelineItemType === "PERSON_PLN_NOTE")
    .sort((a, b) => b.itemDate - a.itemDate);
  const familyMemberNotes = ([member])
    .map((fm) =>
      fm.timeline.map((e) => ({
        ...e,
        memberName: `${fm.firstName} ${fm.lastName ?? ""}`,
      })),
    )
    .flat(2)
    .filter((e) => e.timelineItemType === "PERSON_PLN_NOTE")
    .sort((a, b) => b.itemDate - a.itemDate);
  var actualFamilyNotes;
  if(familyNotes.length == 0) {actualFamilyNotes = familyMemberNotes;} 
  else {actualFamilyNotes = familyNotes;}  const lfsDate = (lastFamilySuccessfulUpdate ?? {}).lsDate;
  const lfaDate = (lastFamilyAttemptedUpdate ?? {}).laDate;

  const datefmt = (d) =>
    d === 0
      ? "Not Recorded"
      : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  const contactDates = [
    { title: "Family Last Succesfully Contacted", detail: datefmt(lfsDate) },
    { title: "Person Last Successfully Contacted", detail: datefmt(lsDate) },
    { title: "Family Last Contact Attempt", detail: datefmt(lfaDate) },
    { title: "Person Last Attempted Contact", detail: datefmt(laDate) },
  ];

  const contactNotes = [
    {
      title: "Family Last Succesful Contact",
      detail: lastFamilySuccessful.lessonReview ?? "No Notes",
    },
    {
      title: "Person Last Successful Contact",
      detail: lastSuccessful.lessonReview ?? "No Notes",
    },
    {
      title: "Family Last Attempted Contact",
      detail: lastFamilyAttempted.lessonReview ?? "No Notes",
    },
    {
      title: "Person Last Attempted Contact",
      detail: lastAttempted.lessonReview ?? "No Notes",
    },
  ];

  /** lessonReview */
  if (!family) return { tag: "div", style: "display:none;" };
  return {
    tag: "div",
    style: "justify-content: center; text-align: center;",
    children: [
      MemberDetailCard({
        header: "Family Notes",
        cards: actualFamilyNotes.map((fn) => ({
          title: fn.memberName,
          detail: fn.lessonPlan,
          smallBreak: true,
        })),
      }),
      MemberDetailCard({
        header: "Contact Dates",
        cards: contactDates,
        smallBreak: true,
      }),
      MemberDetailCard({
        header: "Contact Notes",
        cards: contactNotes,
        smallBreak: true,
      }),
    ],
  };
}

function BunkMemberDetails() {
  return { tag: "div", className: "member-details", style: "display: none;" };
}

function MemberDetails(props) {
  const { open, member, close, family, openMember } = props;

  if (!member) return BunkMemberDetails();
  const familyTimelines = family.map((fm) => ({
    ...fm,
    timeline: memberTimelines[fm.personGuid],
  }));
  const familyMemberTimeline = {
      ...member,
      timeline: memberTimelines[member.personGuid],
    };
  
  return {
    tag: "div",
    style: "position:absolute; top:0;left:0;",
    children: [
      {
        tag: "div",
        className: "member-details",
        style: `position: absolute; width: 100vw; height: 100vh; display: ${
          open ? "block" : "none"
        }; z-index: 5; top: 0; background-color: white; overflow: hidden; background-color: #f5f5f5`,
        children: [
          {
            tag: "div",
            style: "display: flex; flex-wrap: wrap; height: 2rem;",
            className: "member-details-actions",
            children: [
              {
                tag: "button",
                onclick: close,
                innerText: "Close",
              },
            ],
          },
          {
            tag: "div",
            className: "member-details-self",
            style:
              "overflow-y: auto; height: calc(100vh - 2rem);padding-bottom:4rem;",
            children: [
              {
                tag: "div",
                className: "member-details-info-display",
                style:
                  "display: flex; flex-wrap: wrap; justify-content: center;",
                children: [
                  {
                    tag: "div",
                    style:
                      "display: flex; flex-wrap: wrap; justify-content: center;",
                    className: "member-details-info-heading",
                    children: [
                      {
                        tag: "h1",
                        style: "color: #232323;",
                        innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="8rem" height="8rem"><!--! Font Awesome Free 6.1.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2022 Fonticons, Inc. --><path d="M224 256c70.7 0 128-57.31 128-128S294.7 0 224 0C153.3 0 96 57.31 96 128S153.3 256 224 256zM274.7 304H173.3c-95.73 0-173.3 77.6-173.3 173.3C0 496.5 15.52 512 34.66 512H413.3C432.5 512 448 496.5 448 477.3C448 381.6 370.4 304 274.7 304zM479.1 320h-73.85C451.2 357.7 480 414.1 480 477.3C480 490.1 476.2 501.9 470 512h138C625.7 512 640 497.6 640 479.1C640 391.6 568.4 320 479.1 320zM432 256C493.9 256 544 205.9 544 144S493.9 32 432 32c-25.11 0-48.04 8.555-66.72 22.51C376.8 76.63 384 101.4 384 128c0 35.52-11.93 68.14-31.59 94.71C372.7 243.2 400.8 256 432 256z"/></svg>`,
                      },
                      {
                        tag: "h1",
                        style: "margin: auto",
                        innerText: `${member.firstName} ${member.lastName}`,
                      },
                    ],
                  },
                  {
                    tag: "div",
                    style:
                      "display: flex; width: 100%; justify-content: center;",
                    id: "member-details-timeline-data-wrapper",
                    children: [
                      MemberTimelineData({
                        member: familyMemberTimeline,
                        family: familyTimelines,
                      }),
                    ],
                  },
                ],
              },
              {
                tag: "div",
                style:
                  "display: flex; flex-wrap: wrap; max-width:80%; margin: auto; gap: 1rem",
                className: "member-details-family",
                children: family.map((fm) =>
                  MemberBox({ member: fm, openDetailed: openMember(fm) }),
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}

function OrgDisplay(props) {
  const { orgName, orgMembers } = props;

  const sortedMembers = orgMembers.sort((m1, m2) =>
    householdMembers[m1.householdGuid].commonMember.lastName.localeCompare(
      householdMembers[m2.householdGuid].commonMember.lastName,
    ),
  );

  // Controls Accordion
  const orgCordionToggle = ({ target }) => {
    const panel = target.nextElementSibling;
    panel.style.display = panel.style.display === "flex" ? "none" : "flex";
  };

  const openDetailed =
    (m) =>
    ({ target }) => {
      const orgDisplay = target.parentElement.closest(".org-display");
      const orgMemberDisplay = orgDisplay.querySelector(`.org-members`);
      orgMemberDisplay.style.display = "none";
      const family = householdMembers[m.householdGuid].members.map(
        (m) => m.personGuid,
      );
      const familyMembers = orgMembers.filter((om) =>
        family.includes(om.personGuid),
      );
      const newMemberDetails = renderComponent(
        MemberDetails({
          open: true,
          member: m,
          openMember: openDetailed,
          close: closeDetailed,
          family: family.length === 1 ? [] : familyMembers,
        }),
      );
      orgDisplay.replaceChild(newMemberDetails, orgDisplay.childNodes[2]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

  const closeDetailed = ({ target }) => {
    const orgDisplay = target.parentElement.closest(".org-display");
    const orgMemberDisplay = orgDisplay.querySelector(`.org-members`);
    orgMemberDisplay.style.display = "flex";
    const newMemberDetails = renderComponent(BunkMemberDetails());
    orgDisplay.replaceChild(newMemberDetails, orgDisplay.childNodes[2]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return {
    className: "org-display",
    style: "width: 100%",
    children: [
      {
        tag: "h1",
        style: "text-align: center",
        innerText: orgName,
        onclick: orgCordionToggle,
      },
      {
        className: "org-members",
        style: "display: none; max-width: 1200px; margin: auto;",
        children: sortedMembers.map((member) =>
          MemberBox({ member, openDetailed: openDetailed(member) }),
        ),
      },
      BunkMemberDetails(),
      ExportButton({ orgMembers }),
    ],
  };
}

function MemberBook(props) {
  const { areaMembers } = props;
  const orgs = Object.keys(areaMembers).map((o) =>
    OrgDisplay({ orgName: o, orgMembers: areaMembers[o] }),
  );

  return {
    tag: "div",
    className: "memberbook",
    style: "display: flex; flex-wrap: wrap; width: 100%",
    children: [...orgs],
  };
}

function paint(c) {
  const newRoot = buildFakeRoot();
  const component = c ?? MemberBook({ areaMembers });
  newRoot.appendChild(renderComponent(component));
}

function applyCss() {
  const head = document.head || document.getElementsByTagName("head")[0];
  const style = document.createElement("style");
  head.appendChild(style);
  const css = `
  .memberbook {
    font-family: "Roboto", "Helvetica", "Arial", sans-serif;
  }
    .org-display > h1 {
   background-color: #eee;
    color: #444;
    cursor: pointer;
    padding: 18px;
    width: 100%;
    border: none;
    text-align: left;
    outline: none;
    font-size: 15px;
    transition: 0.4s;
    margin: 0;
    }
      .org-display > h1:hover {
      background-color: #ccc;
      }

      .org-display > h1:after {
        content: '\\02795'; /* Unicode character for "plus" sign (+) */
        font-size: 13px;
        color: #777;
        float: right;
        margin-left: 5px;
      }

    .org-members {
      background-color: white;
      display: flex;
      flex-wrap: wrap;
      gap: .75rem;
      margin: .75rem 0;
    }

    .org-member {
     text-align:center;
     max-width: 192px;
     width: 100%;
     margin: auto;
     padding: 1rem;
     border-radius: 8px;
     height: 192px;
    }

    .org-member.f {
      background-color: #ffe6f2;
    }

    .org-member.m {
      background-color: #e6f7ff;
    }

    .org-member.u {
      background-color: #e6ffe6;
    }
    

    .org-member-data {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
    }

    .org-member-data > p {
      margin: auto;
      width: 100%;
    }

    .org-member-data > a {
     margin: auto;
     padding: .125rem;
     width: 100%;
    }

    .member-details-timeline-specifics > h1 {
      font-size: 1rem;
      width: 100%;
    }
  
  
  `;
  style.type = "text/css";
  if (style.styleSheet) {
    style.styleSheet.cssText = css; // This is required for IE8 and below
  } else {
    style.appendChild(document.createTextNode(css));
  }
}

async function coreInit() {
  if (members.length === 0) await updateMembers(1);
  else updateMembers(1);
  updateAreaMembers(members);
  updateHouseholdMembers(members);
}

async function initSystem() {
  // coreInit();
  await updateMemberTimelines(members);
  updateMemberLastUpdated(members);
}

// Paint Loading Screen
paint({ tag: "h1", innerText: "Loading...", style: "text-align:center;" });
applyCss(); // Apply Css

// Initial Load with Core Application
await coreInit();
paint({
  tag: "h1",
  innerText: "Initial Load Completed - Timelines Loading...",
  style: "text-align:center;",
});

// Secondary Load with updated information;
initSystem().then(() => paint());
