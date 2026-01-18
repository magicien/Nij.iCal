// Calendar Viewer Application
(function() {
  'use strict';

  // Application state
  const state = {
    currentView: 'month', // 'year', 'month', 'day', 'detail', 'search'
    currentDate: new Date(),
    selectedDate: new Date(),
    language: 'ja', // 'ja' or 'en'
    selectedCalendar: 'events', // Default: all events
    events: [],
    talents: [],
    previousView: null, // Track previous view for back button
    selectedEvent: null,
    originalSelectedEvent: null, // Original event when first entering detail view (for back button text)
    renderedMonthRange: null, // {startYear, startMonth, endYear, endMonth}
    isLoadingMonths: false, // Flag to prevent multiple simultaneous loads
    currentTimeUpdateInterval: null, // Interval ID for updating current time indicator
    currentTimeUpdateTimeout: null, // Timeout ID for initial current time update
    todayDate: new Date(), // Track today's date for detecting date changes
    dateCheckInterval: null, // Interval ID for checking date changes
    embedded: false, // Embedded mode (from iframe)
  };

  // Translations
  const translations = {
    ja: {
      search: '検索',
      today: '今日',
      calendar: 'カレンダー選択',
      language: '言語選択',
      all: 'すべて',
      close: '閉じる',
      back: '戻る',
      loading: '読み込み中...',
      noEvents: 'イベントがありません',
      location: '場所',
      startTime: '開始',
      endTime: '終了',
      url: 'URL',
      description: '詳細',
      map: 'マップ',
      openMap: '地図を開く',
      year: '年',
      weekdays: ['日', '月', '火', '水', '木', '金', '土'],
      months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    },
    en: {
      search: 'Search',
      today: 'Today',
      calendar: 'Select Calendar',
      language: 'Select Language',
      all: 'All',
      close: 'Close',
      back: 'Back',
      loading: 'Loading...',
      noEvents: 'No events',
      location: 'Location',
      startTime: 'Start',
      endTime: 'End',
      url: 'URL',
      description: 'Description',
      map: 'Map',
      openMap: 'Open Map',
      year: '',
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    }
  };

  // Utility functions
  function formatDate(date, format = 'YYYY-MM-DD') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes);
  }

  function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  function isSameMonth(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth();
  }

  function isSameYear(date1, date2) {
    return date1.getFullYear() === date2.getFullYear();
  }

  // Schedule current time indicator update to sync with clock minute changes
  function scheduleCurrentTimeUpdate(updateFunction) {
    // Clear existing timers
    if (state.currentTimeUpdateInterval) {
      clearInterval(state.currentTimeUpdateInterval);
      state.currentTimeUpdateInterval = null;
    }
    if (state.currentTimeUpdateTimeout) {
      clearTimeout(state.currentTimeUpdateTimeout);
      state.currentTimeUpdateTimeout = null;
    }

    // Calculate milliseconds until next minute
    const now = new Date();
    const secondsUntilNextMinute = 60 - now.getSeconds();
    const msUntilNextMinute = secondsUntilNextMinute * 1000 - now.getMilliseconds();

    // Schedule first update at the start of next minute
    state.currentTimeUpdateTimeout = setTimeout(() => {
      updateFunction();
      // Then update every minute
      state.currentTimeUpdateInterval = setInterval(updateFunction, 60000);
    }, msUntilNextMinute);
  }

  // Check if event is a special case: 23:59 start with next day 00:29 end (treat as single-day)
  function isSpecialMidnightEvent(event) {
    if (event.isAllDay) return false;

    const start = event.startDate;
    const end = event.endDate;

    // Check if start is 23:59 and end is next day before 00:30
    if (start.getHours() === 23 && start.getMinutes() === 59) {
      const nextDay = new Date(start);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);

      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);

      if (endDay.getTime() === nextDay.getTime() && end.getHours() === 0 && end.getMinutes() <= 29) {
        return true;
      }
    }

    return false;
  }

  function getEventsForDate(date) {
    return state.events.filter(event => {
      const start = event.startDate;
      const end = event.endDate;

      // Special case: 23:59 - 00:29 events (treat as single-day)
      if (isSpecialMidnightEvent(event)) {
        return isSameDay(start, date);
      }

      // All day events
      if (event.isAllDay) {
        const eventStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        // For all-day events, the end date is exclusive (the day after the last day)
        const eventEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        eventEnd.setDate(eventEnd.getDate() - 1);
        const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return checkDate >= eventStart && checkDate <= eventEnd;
      }

      // Timed events
      return isSameDay(start, date) ||
             (date >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
              date <= new Date(end.getFullYear(), end.getMonth(), end.getDate()));
    });
  }

  function getEventsForMonth(year, month) {
    return state.events.filter(event => {
      const start = event.startDate;
      const end = event.endDate;

      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      return (start <= monthEnd && end >= monthStart);
    });
  }

  // Load talents from CSV
  async function loadTalents() {
    try {
      const response = await fetch('data/talents.csv');
      const text = await response.text();
      const lines = text.split('\n');
      const talents = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV properly (handle commas in quoted fields)
        const parts = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            parts.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current);

        if (parts.length < 5) continue;

        const name = parts[0];
        const romaji = parts[3];
        const furigana = parts[4];
        const graduated = parts.length > 14 && parts[14].trim();

        if (!graduated && romaji && romaji !== 'Nijisanji') {
          const filename = romaji.replace(/ /g, '_').toLowerCase() + '.ics';
          talents.push({
            name: name,
            romaji: romaji,
            furigana: furigana,
            filename: filename,
          });
        }
      }

      state.talents = talents;
      sortTalents();
    } catch (error) {
      console.error('Error loading talents:', error);
      state.talents = [];
    }
  }

  // Sort talents based on current language
  function sortTalents() {
    state.talents.sort((a, b) => {
      if (state.language === 'ja') {
        return a.furigana.localeCompare(b.furigana, 'ja');
      } else {
        return a.romaji.localeCompare(b.romaji, 'en');
      }
    });
  }

  // Load and parse iCal data
  async function loadCalendar(filename) {
    // Show loading indicator first
    showLoading(true);

    // Clear events
    state.events = [];

    try {
      const files = filename === 'events.ics' ? ['events.ics', 'birthdays.ics'] : [filename];
      const allEvents = [];

      for (const file of files) {
        const url = `${state.language}/${file}`;
        const response = await fetch(url);
        const text = await response.text();

        const jcalData = ICAL.parse(text);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');

        vevents.forEach(vevent => {
          const event = new ICAL.Event(vevent);

          // Extract geo location
          let geo = null;
          const location = vevent.getFirstPropertyValue('location');
          const geoProps = vevent.getAllProperties('x-apple-structured-location');
          if (geoProps && geoProps.length > 0) {
            const geoValue = geoProps[0].getFirstValue();
            if (geoValue && geoValue.includes('geo:')) {
              const match = geoValue.match(/geo:([\d.-]+),([\d.-]+)/);
              if (match) {
                geo = {
                  lat: parseFloat(match[1]),
                  lng: parseFloat(match[2])
                };
              }
            }
          }

          // Check if this is a recurring event
          if (event.isRecurring()) {
            // Expand recurring events from 2018 to current year + 1
            const today = new Date();
            const expandStart = new ICAL.Time.fromJSDate(new Date(2018, 0, 1));
            const expandEnd = new ICAL.Time.fromJSDate(new Date(today.getFullYear() + 1, 11, 31));

            try {
              // Start iterator from the original event start date
              const expand = event.iterator();
              let next;

              while ((next = expand.next())) {
                // Skip occurrences before our expand range
                if (next.compare(expandStart) < 0) continue;
                // Stop when we exceed our expand range
                if (next.compare(expandEnd) > 0) break;

                const occurrenceStart = next.toJSDate();
                const isAllDay = event.startDate.isDate;

                // Calculate duration properly for all-day and timed events
                let occurrenceEnd;
                if (event.duration) {
                  const duration = event.duration.toSeconds();
                  occurrenceEnd = new Date(occurrenceStart.getTime() + duration * 1000);
                } else {
                  // Calculate duration from original start/end
                  const originalDuration = event.endDate.toUnixTime() - event.startDate.toUnixTime();
                  occurrenceEnd = new Date(occurrenceStart.getTime() + originalDuration * 1000);
                }

                allEvents.push({
                  uid: event.uid + '-' + next.toString(),
                  summary: event.summary,
                  description: event.description || '',
                  location: location || '',
                  url: event.component.getFirstPropertyValue('url') || '',
                  startDate: occurrenceStart,
                  endDate: occurrenceEnd,
                  isAllDay: isAllDay,
                  geo: geo,
                });
              }
            } catch (error) {
              console.error('Error expanding recurring event:', event.summary, error);
            }
          } else {
            // Non-recurring event
            const startDate = event.startDate.toJSDate();
            const endDate = event.endDate.toJSDate();
            const isAllDay = event.startDate.isDate;

            allEvents.push({
              uid: event.uid,
              summary: event.summary,
              description: event.description || '',
              location: location || '',
              url: event.component.getFirstPropertyValue('url') || '',
              startDate: startDate,
              endDate: endDate,
              isAllDay: isAllDay,
              geo: geo,
            });
          }
        });
      }

      state.events = allEvents.sort((a, b) => a.startDate - b.startDate);

      // Re-render with loaded events
      renderCurrentView();
    } catch (error) {
      console.error('Error loading calendar:', error);
      showLoading(false);
    }
  }

  // Show/hide loading indicator
  function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (show) {
      loadingEl.classList.add('active');
    } else {
      loadingEl.classList.remove('active');
    }
  }

  // Render views
  function renderCurrentView() {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });

    // Show current view
    const viewEl = document.getElementById(`${state.currentView}-view`);
    if (viewEl) {
      viewEl.classList.add('active');
    }

    // Show/hide header and search bar based on view
    const header = document.getElementById('header');
    const searchBar = document.getElementById('search-bar');
    const mainContent = document.getElementById('main-content');

    if (state.currentView === 'detail') {
      // Hide header and search bar for detail view
      header.style.display = 'none';
      searchBar.style.display = 'none';
      searchBar.classList.remove('active');
      mainContent.classList.add('detail-view-content');
    } else {
      // Show header and search bar for other views
      header.style.display = '';
      searchBar.style.display = '';
      mainContent.classList.remove('detail-view-content');
    }

    // Restore normal header for non-month views
    if (state.currentView !== 'month') {
      restoreNormalHeader();
    }

    // Render based on current view
    switch (state.currentView) {
      case 'year':
        renderYearView();
        break;
      case 'month':
        renderMonthView();
        break;
      case 'day':
        renderDayView();
        break;
      case 'detail':
        renderDetailView();
        break;
    }
  }

  function updateYearDisplay() {
    const mainContent = document.getElementById('main-content');
    const yearContainers = document.querySelectorAll('.year-container');
    if (yearContainers.length === 0) return;

    const scrollTop = mainContent.scrollTop;
    const viewportMiddle = scrollTop + mainContent.clientHeight / 2;

    let currentYear = state.currentDate.getFullYear();

    for (const container of yearContainers) {
      const rect = container.getBoundingClientRect();
      const containerTop = scrollTop + rect.top - mainContent.getBoundingClientRect().top;
      const containerBottom = containerTop + rect.height;

      if (viewportMiddle >= containerTop && viewportMiddle < containerBottom) {
        const yearAttr = container.getAttribute('data-year');
        if (yearAttr) {
          currentYear = parseInt(yearAttr);
          break;
        }
      }
    }

    // Update URL if year changed
    const previousYear = state.currentDate.getFullYear();
    if (currentYear !== previousYear) {
      state.currentDate = new Date(currentYear, state.currentDate.getMonth(), 1);
      updateURL();
    }
  }

  function renderYearView() {
    const container = document.getElementById('year-view');
    container.innerHTML = '';

    const today = new Date();
    const startYear = 2018;
    const endYear = today.getFullYear() + 1;

    // Render all years from 2018 to next year
    for (let year = startYear; year <= endYear; year++) {
      const yearContainer = document.createElement('div');
      yearContainer.className = 'year-container';
      yearContainer.setAttribute('data-year', year);

      const yearTitle = document.createElement('div');
      yearTitle.className = 'year-title';
      if (year === today.getFullYear()) {
        yearTitle.classList.add('current');
      }
      yearTitle.textContent = state.language === 'ja' ? `${year}年` : year;
      yearContainer.appendChild(yearTitle);

      const monthsGrid = document.createElement('div');
      monthsGrid.className = 'months-grid';

      for (let month = 0; month < 12; month++) {
        const miniMonth = createMiniMonth(year, month, today);
        monthsGrid.appendChild(miniMonth);
      }

      yearContainer.appendChild(monthsGrid);
      container.appendChild(yearContainer);
    }

    // Add scroll listener to update URL on scroll
    const mainContent = document.getElementById('main-content');
    mainContent.removeEventListener('scroll', updateYearDisplay);
    mainContent.addEventListener('scroll', updateYearDisplay);

    // Scroll to the year of currentDate
    scrollToCurrentYear();
  }

  function createMiniMonth(year, month, today) {
    const monthDiv = document.createElement('div');
    monthDiv.className = 'mini-month';
    monthDiv.onclick = () => {
      state.currentDate = new Date(year, month, 1);
      showLoading(true);
      setTimeout(() => {
        switchView('month');
      }, 50);
    };

    const title = document.createElement('div');
    title.className = 'mini-month-title';
    if (month === today.getMonth() && year === today.getFullYear()) {
      title.classList.add('current');
    }
    title.textContent = translations[state.language].months[month];
    monthDiv.appendChild(title);

    const calendar = document.createElement('div');
    calendar.className = 'mini-calendar';

    // Calendar body
    const body = document.createElement('div');
    body.className = 'mini-calendar-body';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      body.appendChild(document.createElement('div'));
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'mini-day';
      dayEl.textContent = day;

      if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
        dayEl.classList.add('today');
      }

      body.appendChild(dayEl);
    }

    calendar.appendChild(body);
    monthDiv.appendChild(calendar);

    return monthDiv;
  }

  function renderMonthView() {
    const container = document.getElementById('month-view');
    container.innerHTML = '';

    // Update header to show calendar info
    updateHeaderForMonthView();

    // Calendar body
    const calendar = document.createElement('div');
    calendar.className = 'month-calendar';
    calendar.id = 'month-calendar-body';

    container.appendChild(calendar);

    // Initial render: current month ± 6 months
    const currentYear = state.currentDate.getFullYear();
    const currentMonth = state.currentDate.getMonth();

    renderMonthRange(currentYear, currentMonth - 6, currentYear, currentMonth + 6);

    // Add scroll listener to update year display and load more months
    const mainContent = document.getElementById('main-content');
    mainContent.classList.add('month-view-content');

    // Remove existing listeners if any
    mainContent.removeEventListener('scroll', updateMonthYearDisplay);
    mainContent.removeEventListener('scroll', onMonthViewScroll);
    mainContent.removeEventListener('scroll', updateYearDisplay);
    mainContent.addEventListener('scroll', updateMonthYearDisplay);
    mainContent.addEventListener('scroll', onMonthViewScroll);

    // Scroll to current month
    scrollToCurrentMonth();
  }

  function renderMonthRange(startYear, startMonth, endYear, endMonth) {
    const calendar = document.getElementById('month-calendar-body');
    if (!calendar) return;

    // Normalize start and end dates
    let start = new Date(startYear, startMonth, 1);
    let end = new Date(endYear, endMonth, 1);

    // Clamp to allowed range (2018/01 to next year/12)
    const minDate = new Date(2018, 0, 1);
    const maxDate = new Date(new Date().getFullYear() + 1, 11, 1);
    if (start < minDate) start = minDate;
    if (end > maxDate) end = maxDate;

    const actualStartYear = start.getFullYear();
    const actualStartMonth = start.getMonth();
    const actualEndYear = end.getFullYear();
    const actualEndMonth = end.getMonth();

    // Update rendered range
    if (!state.renderedMonthRange) {
      state.renderedMonthRange = {
        startYear: actualStartYear,
        startMonth: actualStartMonth,
        endYear: actualEndYear,
        endMonth: actualEndMonth
      };
    } else {
      // Merge with existing range
      const existingStart = new Date(state.renderedMonthRange.startYear, state.renderedMonthRange.startMonth, 1);
      const existingEnd = new Date(state.renderedMonthRange.endYear, state.renderedMonthRange.endMonth, 1);

      if (start < existingStart) {
        state.renderedMonthRange.startYear = actualStartYear;
        state.renderedMonthRange.startMonth = actualStartMonth;
      }
      if (end > existingEnd) {
        state.renderedMonthRange.endYear = actualEndYear;
        state.renderedMonthRange.endMonth = actualEndMonth;
      }
    }

    // Render months in the range
    let currentDate = new Date(actualStartYear, actualStartMonth, 1);
    const endDate = new Date(actualEndYear, actualEndMonth, 1);

    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const dateKey = `${year}-${month}`;

      // Check if this month already exists
      const existing = calendar.querySelector(`.month-section[data-date="${dateKey}"]`);
      if (!existing) {
        const monthSection = createMonthSection(new Date(year, month, 1));

        // Find correct position to insert
        insertMonthSectionInOrder(calendar, monthSection, year, month);
      }

      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  function insertMonthSectionInOrder(calendar, newSection, year, month) {
    const newDate = new Date(year, month, 1);
    const sections = calendar.querySelectorAll('.month-section');

    let inserted = false;
    for (const section of sections) {
      const dateAttr = section.getAttribute('data-date');
      const [sectionYear, sectionMonth] = dateAttr.split('-').map(Number);
      const sectionDate = new Date(sectionYear, sectionMonth, 1);

      if (newDate < sectionDate) {
        calendar.insertBefore(newSection, section);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      calendar.appendChild(newSection);
    }
  }

  function onMonthViewScroll() {
    if (state.isLoadingMonths) return;

    const mainContent = document.getElementById('main-content');
    const scrollTop = mainContent.scrollTop;
    const scrollHeight = mainContent.scrollHeight;
    const clientHeight = mainContent.clientHeight;

    const threshold = 1000; // Load more when within 1000px of edge

    // Load more past months when scrolling near top
    if (scrollTop < threshold) {
      state.isLoadingMonths = true;
      const range = state.renderedMonthRange;
      const loadStart = new Date(range.startYear, range.startMonth - 6, 1);
      const loadEnd = new Date(range.startYear, range.startMonth - 1, 1);

      // Find a reference element to maintain scroll position
      const calendar = document.getElementById('month-calendar-body');
      const sections = calendar.querySelectorAll('.month-section');
      let referenceDateKey = null;
      let referenceOffset = 0;

      // Find the first section that is currently visible in viewport
      const mainRect = mainContent.getBoundingClientRect();
      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        // Check if section is visible in viewport
        if (rect.bottom > mainRect.top && rect.top < mainRect.bottom) {
          referenceDateKey = section.getAttribute('data-date');
          referenceOffset = rect.top - mainRect.top;
          break; // Use the first visible section
        }
      }

      // Temporarily disable scroll events to prevent recursion
      mainContent.removeEventListener('scroll', onMonthViewScroll);
      mainContent.removeEventListener('scroll', updateMonthYearDisplay);

      renderMonthRange(loadStart.getFullYear(), loadStart.getMonth(), loadEnd.getFullYear(), loadEnd.getMonth());

      // Restore scroll position based on reference element
      if (referenceDateKey) {
        // Use requestAnimationFrame to ensure DOM is painted
        requestAnimationFrame(() => {
          const referenceSection = calendar.querySelector(`.month-section[data-date="${referenceDateKey}"]`);
          if (referenceSection) {
            const newRect = referenceSection.getBoundingClientRect();
            const mainRect = mainContent.getBoundingClientRect();
            const currentOffset = newRect.top - mainRect.top;
            const scrollAdjustment = currentOffset - referenceOffset;
            mainContent.scrollTop = mainContent.scrollTop + scrollAdjustment;
          }
          // Re-enable scroll events
          setTimeout(() => {
            mainContent.addEventListener('scroll', updateMonthYearDisplay);
            mainContent.addEventListener('scroll', onMonthViewScroll);
            state.isLoadingMonths = false;
          }, 100);
        });
      } else {
        // Re-enable scroll events
        setTimeout(() => {
          mainContent.addEventListener('scroll', updateMonthYearDisplay);
          mainContent.addEventListener('scroll', onMonthViewScroll);
          state.isLoadingMonths = false;
        }, 100);
      }
    }

    // Load more future months when scrolling near bottom
    if (scrollTop + clientHeight > scrollHeight - threshold) {
      state.isLoadingMonths = true;
      const range = state.renderedMonthRange;
      const loadStart = new Date(range.endYear, range.endMonth + 1, 1);
      const loadEnd = new Date(range.endYear, range.endMonth + 6, 1);

      renderMonthRange(loadStart.getFullYear(), loadStart.getMonth(), loadEnd.getFullYear(), loadEnd.getMonth());
      state.isLoadingMonths = false;
    }
  }

  function updateHeaderForMonthView() {
    const header = document.getElementById('header');
    header.classList.add('month-header-mode');

    // Create header structure
    header.innerHTML = '';

    // Top row with year button and right buttons
    const headerTop = document.createElement('div');
    headerTop.id = 'header-top';

    const yearBtn = document.createElement('button');
    yearBtn.className = 'month-year-btn';
    yearBtn.id = 'month-year-display';
    const yearText = state.language === 'ja' ?
      `< ${state.currentDate.getFullYear()}年` :
      `< ${state.currentDate.getFullYear()}`;
    yearBtn.textContent = yearText;
    yearBtn.onclick = () => {
      showLoading(true);
      setTimeout(() => {
        switchView('year');
      }, 50);
    };
    headerTop.appendChild(yearBtn);

    const headerRight = document.createElement('div');
    headerRight.id = 'header-right';

    const searchBtn = document.createElement('button');
    searchBtn.id = 'search-btn';
    searchBtn.title = translations[state.language].search;
    searchBtn.textContent = '🔍';
    headerRight.appendChild(searchBtn);

    const logo = document.createElement('img');
    logo.id = 'logo';
    logo.src = 'imgs/logo.png';
    logo.alt = 'Nij.iCal';
    logo.title = 'ホームへ';
    headerRight.appendChild(logo);

    headerTop.appendChild(headerRight);
    header.appendChild(headerTop);

    // Calendar info section
    const calendarInfo = document.createElement('div');
    calendarInfo.id = 'header-calendar-info';

    const currentMonth = state.currentDate.getMonth();
    const monthDisplay = document.createElement('div');
    monthDisplay.className = 'month-current-display';
    monthDisplay.id = 'month-current-display';
    const monthText = state.language === 'ja' ?
      `${translations[state.language].months[currentMonth]}` :
      `${translations[state.language].months[currentMonth]}`;
    monthDisplay.textContent = monthText;
    calendarInfo.appendChild(monthDisplay);

    const weekdays = document.createElement('div');
    weekdays.className = 'weekdays';
    translations[state.language].weekdays.forEach(day => {
      const dayEl = document.createElement('div');
      dayEl.textContent = day;
      weekdays.appendChild(dayEl);
    });
    calendarInfo.appendChild(weekdays);

    header.appendChild(calendarInfo);

    // Re-attach event listeners
    document.getElementById('search-btn').onclick = () => {
      document.getElementById('search-bar').classList.add('active');
      document.getElementById('search-input').focus();
    };

    document.getElementById('logo').onclick = () => {
      window.location.href = state.language === 'ja' ? './' : './index_en.html';
    };
  }

  function restoreNormalHeader() {
    const header = document.getElementById('header');
    header.classList.remove('month-header-mode');

    header.innerHTML = '';

    const headerLeft = document.createElement('div');
    headerLeft.id = 'header-left';
    const headerTitle = document.createElement('span');
    headerTitle.id = 'header-title';
    headerLeft.appendChild(headerTitle);
    header.appendChild(headerLeft);

    const headerRight = document.createElement('div');
    headerRight.id = 'header-right';

    // Remove scroll listeners
    const mainContent = document.getElementById('main-content');
    mainContent.removeEventListener('scroll', updateMonthYearDisplay);
    mainContent.removeEventListener('scroll', onMonthViewScroll);
    mainContent.removeEventListener('scroll', updateYearDisplay);

    const searchBtn = document.createElement('button');
    searchBtn.id = 'search-btn';
    searchBtn.title = translations[state.language].search;
    searchBtn.textContent = '🔍';
    headerRight.appendChild(searchBtn);

    const logo = document.createElement('img');
    logo.id = 'logo';
    logo.src = 'imgs/logo.png';
    logo.alt = 'Nij.iCal';
    logo.title = 'ホームへ';
    headerRight.appendChild(logo);

    header.appendChild(headerRight);

    // Re-attach event listeners
    document.getElementById('search-btn').onclick = () => {
      document.getElementById('search-bar').classList.add('active');
      document.getElementById('search-input').focus();
    };

    document.getElementById('logo').onclick = () => {
      window.location.href = state.language === 'ja' ? './' : './index_en.html';
    };

    mainContent.classList.remove('month-view-content');

    // Remove month view scroll listener
    mainContent.removeEventListener('scroll', onMonthViewScroll);

    // Reset rendered month range
    state.renderedMonthRange = null;
  }

  function updateMonthYearDisplay() {
    const mainContent = document.getElementById('main-content');
    const calendar = document.getElementById('month-calendar-body');
    if (!calendar) return;

    const monthSections = calendar.querySelectorAll('.month-section');
    const scrollTop = mainContent.scrollTop;
    const viewportMiddle = scrollTop + mainContent.clientHeight / 2;

    let currentYear = state.currentDate.getFullYear();
    let currentMonth = state.currentDate.getMonth();

    for (const section of monthSections) {
      const rect = section.getBoundingClientRect();
      const sectionTop = scrollTop + rect.top - mainContent.getBoundingClientRect().top;
      const sectionBottom = sectionTop + rect.height;

      if (viewportMiddle >= sectionTop && viewportMiddle < sectionBottom) {
        const dateAttr = section.getAttribute('data-date');
        if (dateAttr) {
          const [year, month] = dateAttr.split('-');
          currentYear = parseInt(year);
          currentMonth = parseInt(month);
          break;
        }
      }
    }

    // Update URL if month changed
    const previousYear = state.currentDate.getFullYear();
    const previousMonth = state.currentDate.getMonth();
    if (currentYear !== previousYear || currentMonth !== previousMonth) {
      state.currentDate = new Date(currentYear, currentMonth, 1);
      updateURL();
    }

    const yearBtn = document.getElementById('month-year-display');
    if (yearBtn) {
      const yearText = state.language === 'ja' ?
        `< ${currentYear}年` :
        `< ${currentYear}`;
      yearBtn.textContent = yearText;
    }

    const monthDisplay = document.getElementById('month-current-display');
    if (monthDisplay) {
      const monthText = translations[state.language].months[currentMonth];
      monthDisplay.textContent = monthText;
    }
  }

  function scrollToCurrentMonth() {
    setTimeout(() => {
      const targetDate = `${state.currentDate.getFullYear()}-${state.currentDate.getMonth()}`;
      const targetSection = document.querySelector(`.month-section[data-date="${targetDate}"]`);

      if (targetSection) {
        targetSection.scrollIntoView({ block: 'start' });
      }

      // Hide loading indicator after scroll completes
      setTimeout(() => {
        showLoading(false);
      }, 100);
    }, 100);
  }

  function scrollToCurrentYear() {
    setTimeout(() => {
      const targetYear = state.currentDate.getFullYear();
      const targetContainer = document.querySelector(`.year-container[data-year="${targetYear}"]`);

      if (targetContainer) {
        targetContainer.scrollIntoView({ block: 'start' });
      }

      // Hide loading indicator after scroll completes
      setTimeout(() => {
        showLoading(false);
      }, 100);
    }, 100);
  }

  function createMonthSection(date) {
    const section = document.createElement('div');
    section.className = 'month-section';
    section.setAttribute('data-date', `${date.getFullYear()}-${date.getMonth()}`);

    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();

    // Month title
    const title = document.createElement('div');
    title.className = 'month-title';
    if (isSameMonth(date, today)) {
      title.classList.add('current');
    }
    const monthText = state.language === 'ja' ?
      `${year}年 ${translations[state.language].months[month]}` :
      `${translations[state.language].months[month]} ${year}`;
    title.textContent = monthText;
    section.appendChild(title);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Get all events for this month
    const monthEvents = getEventsForMonth(year, month);

    // Calculate number of weeks needed
    const totalCells = firstDay + daysInMonth;
    const weeksNeeded = Math.ceil(totalCells / 7);

    // Calculate multi-day event segments for each week
    const weeklyMultiDaySegments = [];
    for (let week = 0; week < weeksNeeded; week++) {
      const segments = [];

      monthEvents.forEach(event => {
        // Skip special midnight events (23:59 - 00:29)
        if (isSpecialMidnightEvent(event)) {
          return;
        }

        // Process both all-day and timed multi-day events
        const eventStart = new Date(event.startDate.getFullYear(), event.startDate.getMonth(), event.startDate.getDate());
        const eventEnd = new Date(event.endDate.getFullYear(), event.endDate.getMonth(), event.endDate.getDate());

        // For all-day events, subtract 1 day from end (iCal end date is exclusive)
        if (event.isAllDay) {
          eventEnd.setDate(eventEnd.getDate() - 1);
        }

        const daysDiff = Math.floor((eventEnd - eventStart) / (1000 * 60 * 60 * 24));

        // Only process multi-day events (spanning 2+ days)
        if (daysDiff > 0) {
          // Find the first and last day of this week in the calendar
          const weekStartCellIndex = week * 7;
          const weekEndCellIndex = Math.min((week + 1) * 7 - 1, totalCells - 1);

          let weekStartDay = null;
          let weekEndDay = null;

          if (weekStartCellIndex >= firstDay) {
            weekStartDay = weekStartCellIndex - firstDay + 1;
          } else if (weekEndCellIndex >= firstDay) {
            weekStartDay = 1;
          }

          if (weekEndCellIndex >= firstDay) {
            weekEndDay = Math.min(weekEndCellIndex - firstDay + 1, daysInMonth);
          }

          if (weekStartDay && weekEndDay) {
            const weekStart = new Date(year, month, weekStartDay);
            const weekEnd = new Date(year, month, weekEndDay);
            weekEnd.setHours(23, 59, 59, 999);

            // Check if event overlaps with this week
            if (eventEnd >= weekStart && eventStart <= weekEnd) {
              // Calculate start and end columns for this week
              const segmentStart = eventStart > weekStart ? eventStart : weekStart;
              const segmentEnd = eventEnd < weekEnd ? eventEnd : weekEnd;

              const startDayOfMonth = segmentStart.getDate();
              const endDayOfMonth = segmentEnd.getDate();

              const startCellIndex = firstDay + startDayOfMonth - 1;
              const endCellIndex = firstDay + endDayOfMonth - 1;

              const startCol = (startCellIndex % 7) + 1;
              const endCol = (endCellIndex % 7) + 1;

              segments.push({
                event: event,
                startCol: startCol,
                endCol: endCol,
                row: 0
              });
            }
          }
        }
      });

      // Assign rows to segments to avoid overlaps (max 3 rows)
      segments.sort((a, b) => a.startCol - b.startCol);
      const assignedSegments = [];
      segments.forEach(segment => {
        let row = 0;
        let assigned = false;
        while (row < 3) {
          const conflict = assignedSegments.find(s =>
            s.row === row &&
            !(s.endCol < segment.startCol || s.startCol > segment.endCol)
          );
          if (!conflict) {
            segment.row = row;
            assignedSegments.push(segment);
            assigned = true;
            break;
          }
          row++;
        }
        // If not assigned (no space in 3 rows), mark as overflow
        if (!assigned) {
          segment.overflow = true;
        }
      });

      weeklyMultiDaySegments.push(assignedSegments);
    }

    let dayCount = 1;

    for (let week = 0; week < weeksNeeded; week++) {
      const weekContainer = document.createElement('div');
      weekContainer.className = 'week-container';

      const segments = weeklyMultiDaySegments[week];

      // Store the starting day count for this week
      const weekStartDayCount = dayCount;

      // Day numbers row
      const dayNumbersRow = document.createElement('div');
      dayNumbersRow.className = 'week-day-numbers';
      const weekDates = []; // Store dates for this week

      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const cellIndex = week * 7 + dayOfWeek;
        const dayNumberCell = document.createElement('div');
        dayNumberCell.className = 'day-number-cell';

        if (cellIndex >= firstDay && dayCount <= daysInMonth) {
          const currentDate = new Date(year, month, dayCount);
          weekDates[dayOfWeek] = currentDate;

          const dayNumber = document.createElement('div');
          dayNumber.className = 'day-number';
          if (isSameDay(currentDate, today)) {
            dayNumber.classList.add('today');
          }
          dayNumber.textContent = dayCount;
          dayNumberCell.appendChild(dayNumber);
          dayCount++;
        } else {
          weekDates[dayOfWeek] = null;
        }

        dayNumbersRow.appendChild(dayNumberCell);
      }
      weekContainer.appendChild(dayNumbersRow);

      // Hover area for entire date columns (date number + events area)
      const hoverArea = document.createElement('div');
      hoverArea.className = 'week-hover-area';
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const hoverCell = document.createElement('div');
        hoverCell.className = 'hover-cell';
        const cellDate = weekDates[dayOfWeek];
        if (cellDate) {
          hoverCell.classList.add('has-date');
          hoverCell.onclick = () => {
            state.selectedDate = new Date(cellDate);
            showLoading(true);
            setTimeout(() => {
              switchView('day');
            }, 50);
          };
        }
        hoverArea.appendChild(hoverCell);
      }
      weekContainer.appendChild(hoverArea);

      // Click area background for day cells
      const clickBackground = document.createElement('div');
      clickBackground.className = 'week-click-background';

      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const clickCell = document.createElement('div');
        clickCell.className = 'click-cell';

        const cellDate = weekDates[dayOfWeek];
        if (cellDate) {
          clickCell.onclick = () => {
            state.selectedDate = new Date(cellDate);
            showLoading(true);
            setTimeout(() => {
              switchView('day');
            }, 50);
          };
        }

        clickBackground.appendChild(clickCell);
      }
      weekContainer.appendChild(clickBackground);

      // Unified events grid - 3 rows x 7 columns
      const eventsGrid = document.createElement('div');
      eventsGrid.className = 'week-events-grid';

      // Track which slots are occupied: slots[day][row] = true/false
      const slots = [];
      for (let day = 0; day < 7; day++) {
        slots[day] = [false, false, false];
      }

      // Track displayed and overflow event counts per day
      const eventCounts = [];
      for (let day = 0; day < 7; day++) {
        eventCounts[day] = { displayed: 0, overflow: 0 };
      }

      // Mark slots occupied by multi-day events (only assigned ones)
      segments.forEach(segment => {
        if (!segment.overflow) {
          for (let col = segment.startCol; col <= segment.endCol; col++) {
            slots[col - 1][segment.row] = true;
          }
        }
      });

      // Get all multi-day events for the month
      const allMultiDayEvents = monthEvents.filter(e => {
        // Skip special midnight events
        if (isSpecialMidnightEvent(e)) {
          return false;
        }

        const eventStart = new Date(e.startDate.getFullYear(), e.startDate.getMonth(), e.startDate.getDate());
        const eventEnd = new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate());
        if (e.isAllDay) {
          eventEnd.setDate(eventEnd.getDate() - 1);
        }
        const daysDiff = Math.floor((eventEnd - eventStart) / (1000 * 60 * 60 * 24));
        return daysDiff > 0;
      });

      // Add multi-day events to grid (only non-overflow ones)
      segments.forEach(segment => {
        if (!segment.overflow) {
          const eventEl = document.createElement('div');
          eventEl.className = 'event-item event-multi';

          // Determine segment type based on event boundaries
          const event = segment.event;
          const eventStart = new Date(event.startDate.getFullYear(), event.startDate.getMonth(), event.startDate.getDate());
          const eventEnd = new Date(event.endDate.getFullYear(), event.endDate.getMonth(), event.endDate.getDate());
          if (event.isAllDay) {
            eventEnd.setDate(eventEnd.getDate() - 1);
          }

          // Calculate segment dates correctly
          const startCellIndex = week * 7 + (segment.startCol - 1);
          const endCellIndex = week * 7 + (segment.endCol - 1);
          const startDayOfMonth = startCellIndex - firstDay + 1;
          const endDayOfMonth = endCellIndex - firstDay + 1;
          const segmentStartDate = new Date(year, month, startDayOfMonth);
          const segmentEndDate = new Date(year, month, endDayOfMonth);

          // Determine if this segment is at the start or end of the event
          const isEventStart = segmentStartDate.getTime() === eventStart.getTime();
          const isEventEnd = segmentEndDate.getTime() === eventEnd.getTime();

          if (isEventStart && isEventEnd) {
            // Single-week multi-day event - has both start and end rounded corners
            eventEl.classList.add('event-start');
            eventEl.classList.add('event-end');
          } else if (isEventStart) {
            // Start of multi-week event
            eventEl.classList.add('event-start');
          } else if (isEventEnd) {
            // End of multi-week event
            eventEl.classList.add('event-end');
          } else {
            // Middle segment of multi-week event
            eventEl.classList.add('event-middle');
          }

          // Add classes for week boundary positioning
          if (segment.startCol === 1) {
            eventEl.classList.add('event-at-week-start');
          }
          if (segment.endCol === 7) {
            eventEl.classList.add('event-at-week-end');
          }

          // Add time and title for timed events
          if (!segment.event.isAllDay && isEventStart) {
            const timeSpan = document.createElement('span');
            timeSpan.className = 'event-time';
            const hours = segment.event.startDate.getHours();
            const minutes = segment.event.startDate.getMinutes();
            timeSpan.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            eventEl.appendChild(timeSpan);

            const titleSpan = document.createElement('span');
            titleSpan.className = 'event-title';
            titleSpan.textContent = segment.event.summary;
            eventEl.appendChild(titleSpan);
          } else {
            eventEl.textContent = segment.event.summary;
          }

          eventEl.style.gridColumn = `${segment.startCol} / ${segment.endCol + 1}`;
          eventEl.style.gridRow = segment.row + 1;
          eventEl.onclick = (e) => {
            e.stopPropagation();
            showEventDetail(segment.event, 'month');
          };
          eventsGrid.appendChild(eventEl);
        }
      });

      // Add single-day events to grid and calculate final counts
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const currentDate = weekDates[dayOfWeek];
        if (currentDate) {
          // Get single-day events for this day
          const dayEvents = getEventsForDate(currentDate).filter(e => {
            // Special midnight events are treated as single-day
            if (isSpecialMidnightEvent(e)) {
              return true;
            }

            const eventStart = new Date(e.startDate.getFullYear(), e.startDate.getMonth(), e.startDate.getDate());
            const eventEnd = new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate());
            if (e.isAllDay) {
              eventEnd.setDate(eventEnd.getDate() - 1);
            }
            const daysDiff = Math.floor((eventEnd - eventStart) / (1000 * 60 * 60 * 24));
            return daysDiff === 0;
          });

          // Count displayed events in slots
          const displayedCount = slots[dayOfWeek].filter(s => s).length;

          // Place single-day events in available slots
          let eventIndex = 0;
          for (let row = 0; row < 3 && eventIndex < dayEvents.length; row++) {
            if (!slots[dayOfWeek][row]) {
              const event = dayEvents[eventIndex];
              const eventEl = document.createElement('div');
              eventEl.className = 'event-item event-single';

              // Add time and title for timed events
              if (!event.isAllDay) {
                const timeSpan = document.createElement('span');
                timeSpan.className = 'event-time';
                const hours = event.startDate.getHours();
                const minutes = event.startDate.getMinutes();
                timeSpan.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                eventEl.appendChild(timeSpan);

                const titleSpan = document.createElement('span');
                titleSpan.className = 'event-title';
                titleSpan.textContent = event.summary;
                eventEl.appendChild(titleSpan);
              } else {
                eventEl.textContent = event.summary;
              }

              eventEl.style.gridColumn = dayOfWeek + 1;
              eventEl.style.gridRow = row + 1;
              eventEl.onclick = (e) => {
                e.stopPropagation();
                showEventDetail(event, 'month');
              };
              eventsGrid.appendChild(eventEl);
              slots[dayOfWeek][row] = true;
              eventIndex++;
            }
          }

          // Get all multi-day events for this day (including overflow)
          // Note: allMultiDayEvents already excludes special midnight events
          const allMultiDayForDay = allMultiDayEvents.filter(e => {
            const eventStart = new Date(e.startDate.getFullYear(), e.startDate.getMonth(), e.startDate.getDate());
            const eventEnd = new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate());
            if (e.isAllDay) {
              eventEnd.setDate(eventEnd.getDate() - 1);
            }
            const checkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
            return checkDate >= eventStart && checkDate <= eventEnd;
          });

          // Total events for this day
          const totalEvents = allMultiDayForDay.length + dayEvents.length;
          const finalDisplayedCount = slots[dayOfWeek].filter(s => s).length;

          eventCounts[dayOfWeek].overflow = totalEvents - finalDisplayedCount;
        }
      }

      weekContainer.appendChild(eventsGrid);

      // Add +N overlay for each day
      const moreOverlay = document.createElement('div');
      moreOverlay.className = 'week-more-overlay';

      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const moreCell = document.createElement('div');
        moreCell.className = 'more-cell';

        if (eventCounts[dayOfWeek].overflow > 0) {
          const moreEl = document.createElement('div');
          moreEl.className = 'event-more';
          moreEl.textContent = `+${eventCounts[dayOfWeek].overflow}`;
          moreCell.appendChild(moreEl);
        }

        moreOverlay.appendChild(moreCell);
      }

      weekContainer.appendChild(moreOverlay);
      section.appendChild(weekContainer);
    }

    return section;
  }

  function calculateDayEventLayout(timedEvents, date) {
    // Calculate time information for each event
    const eventsWithTime = timedEvents.map(event => {
      const eventStartDay = new Date(event.startDate.getFullYear(), event.startDate.getMonth(), event.startDate.getDate());
      const eventEndDay = new Date(event.endDate.getFullYear(), event.endDate.getMonth(), event.endDate.getDate());
      const currentDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

      const isEventStartDay = eventStartDay.getTime() === currentDay.getTime();
      const isEventEndDay = eventEndDay.getTime() === currentDay.getTime();
      const isMultiDay = eventStartDay.getTime() !== eventEndDay.getTime();

      let startHour, startMinute, endHour, endMinute;

      if (!isMultiDay) {
        startHour = event.startDate.getHours();
        startMinute = event.startDate.getMinutes();
        endHour = event.endDate.getHours();
        endMinute = event.endDate.getMinutes();
      } else if (isEventStartDay) {
        startHour = event.startDate.getHours();
        startMinute = event.startDate.getMinutes();
        // Check if event ends within next day 1:00
        const nextDayOneAM = new Date(currentDay);
        nextDayOneAM.setDate(nextDayOneAM.getDate() + 1);
        nextDayOneAM.setHours(1, 0, 0, 0);

        if (event.endDate <= nextDayOneAM) {
          // Event ends before next day 1:00, calculate hours from start of current day
          const endHours = (event.endDate - currentDay) / (1000 * 60 * 60);
          endHour = Math.floor(endHours);
          endMinute = Math.round((endHours - endHour) * 60);
        } else {
          // Event continues past next day 1:00, cap at 25:00
          endHour = 25;
          endMinute = 0;
        }
      } else if (isEventEndDay) {
        startHour = 0;
        startMinute = 0;
        endHour = event.endDate.getHours();
        endMinute = event.endDate.getMinutes();
      } else {
        startHour = 0;
        startMinute = 0;
        endHour = 25;
        endMinute = 0;
      }

      const startOffset = startHour + startMinute / 60;
      const endOffset = endHour + endMinute / 60;

      return {
        event,
        startHour,
        startMinute,
        endHour,
        endMinute,
        startOffset,
        endOffset
      };
    });

    // Sort by start time
    eventsWithTime.sort((a, b) => a.startOffset - b.startOffset);

    // Step 1: Group events by 20-minute start time proximity
    const eventGroups = [];
    eventsWithTime.forEach(evt => {
      let foundGroup = null;
      for (const group of eventGroups) {
        // Check if this event's start time is within 20 minutes of any event in the group
        const hasCloseStart = group.events.some(e => {
          const diff = Math.abs(e.startOffset - evt.startOffset) * 60;
          return diff <= 20;
        });
        if (hasCloseStart) {
          foundGroup = group;
          break;
        }
      }
      if (foundGroup) {
        foundGroup.events.push(evt);
      } else {
        eventGroups.push({ events: [evt] });
      }
    });

    // Step 2: Calculate group start/end times
    eventGroups.forEach(group => {
      const startOffsets = group.events.map(e => e.startOffset);
      const endOffsets = group.events.map(e => e.endOffset);
      group.groupStart = Math.min(...startOffsets);
      group.groupEnd = Math.max(...endOffsets);
    });

    // Step 3: Sort groups by start time
    eventGroups.sort((a, b) => a.groupStart - b.groupStart);

    // Step 4: Calculate layout for each group
    eventGroups.forEach(group => {
      // Count how many other groups are active when this group starts
      const activeGroupsCount = eventGroups.filter(otherGroup =>
        otherGroup !== group &&
        otherGroup.groupStart < group.groupStart &&
        otherGroup.groupEnd > group.groupStart
      ).length;

      const OFFSET = 16;
      const leftMargin = 65 + (OFFSET * activeGroupsCount);
      const rightMargin = 10;
      const columns = group.events.length;
      const availableWidth = window.innerWidth - leftMargin - rightMargin;
      const columnWidth = availableWidth / columns;

      group.events.forEach((evt, index) => {
        evt.layout = {
          left: leftMargin + (columnWidth * index),
          width: columnWidth - 2
        };
      });
    });

    return eventsWithTime;
  }

  function renderDayView() {
    const container = document.getElementById('day-view');
    container.innerHTML = '';

    // Add swipe support
    let touchStartX = 0;
    let touchEndX = 0;

    container.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    container.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const swipeThreshold = 50;
      if (touchEndX < touchStartX - swipeThreshold) {
        // Swipe left - next day
        const nextDay = new Date(state.selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        state.selectedDate = nextDay;
        renderDayView();
      }
      if (touchEndX > touchStartX + swipeThreshold) {
        // Swipe right - previous day
        const prevDay = new Date(state.selectedDate);
        prevDay.setDate(prevDay.getDate() - 1);
        state.selectedDate = prevDay;
        renderDayView();
      }
    }

    const date = state.selectedDate;
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    // Header
    const header = document.createElement('div');
    header.className = 'day-header';

    const monthBtn = document.createElement('button');
    monthBtn.className = 'day-month-btn';
    monthBtn.textContent = `< ${translations[state.language].months[month]}`;
    monthBtn.onclick = () => {
      state.currentDate = new Date(year, month, 1);
      showLoading(true);
      setTimeout(() => {
        switchView('month');
      }, 50);
    };
    header.appendChild(monthBtn);

    // Week view
    const weekDiv = document.createElement('div');
    weekDiv.className = 'day-week';

    // Get week days
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());

    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const weekDate = new Date(startOfWeek);
      weekDate.setDate(startOfWeek.getDate() + i);

      const weekItem = document.createElement('div');
      weekItem.className = 'day-week-item';
      const isSelected = isSameDay(weekDate, date);
      const isToday = isSameDay(weekDate, today);

      if (isSelected) {
        weekItem.classList.add('selected');
      }
      if (isToday) {
        weekItem.classList.add('today');
      }

      const weekdayEl = document.createElement('div');
      weekdayEl.textContent = translations[state.language].weekdays[i];

      const numberEl = document.createElement('div');
      numberEl.className = 'day-week-number';
      numberEl.textContent = weekDate.getDate();

      weekItem.appendChild(weekdayEl);
      weekItem.appendChild(numberEl);

      weekItem.onclick = () => {
        state.selectedDate = weekDate;
        renderDayView();
        updateURL();
      };
      weekDiv.appendChild(weekItem);
    }
    header.appendChild(weekDiv);

    // Selected date
    const dateDiv = document.createElement('div');
    dateDiv.className = 'day-date';
    const dateText = state.language === 'ja' ?
      `${month + 1}月${day}日` :
      `${translations[state.language].months[month]} ${day}`;
    dateDiv.textContent = dateText;
    header.appendChild(dateDiv);

    // All day events
    const dayEvents = getEventsForDate(date);
    const allDayEvents = dayEvents.filter(e => e.isAllDay);

    if (allDayEvents.length > 0) {
      const allDayDiv = document.createElement('div');
      allDayDiv.className = 'all-day-events';
      allDayEvents.forEach(event => {
        const eventEl = document.createElement('div');
        eventEl.className = 'event-item';
        eventEl.textContent = event.summary;
        eventEl.onclick = () => showEventDetail(event, 'day');
        allDayDiv.appendChild(eventEl);
      });
      header.appendChild(allDayDiv);
    }

    container.appendChild(header);

    // Timeline
    const timeline = document.createElement('div');
    timeline.className = 'day-timeline';
    timeline.style.position = 'relative';

    // Filter timed events (include multi-day events that overlap with current day)
    const timedEvents = dayEvents.filter(e => !e.isAllDay);

    // Create 25 hour slots (0:00 to next day 1:00)
    for (let hour = 0; hour < 25; hour++) {
      const hourSlot = document.createElement('div');
      hourSlot.className = 'hour-slot';
      hourSlot.style.position = 'relative';

      const hourLabel = document.createElement('div');
      hourLabel.className = 'hour-label';
      hourLabel.textContent = `${hour}:00`;
      hourSlot.appendChild(hourLabel);

      const hourContent = document.createElement('div');
      hourContent.className = 'hour-content';
      hourSlot.appendChild(hourContent);

      timeline.appendChild(hourSlot);
    }

    // Calculate event layout considering overlaps
    const eventsWithLayout = calculateDayEventLayout(timedEvents, date);

    // Position events based on calculated layout
    eventsWithLayout.forEach(({ event, startHour, startMinute, startOffset, endOffset, layout }) => {
      const duration = endOffset - startOffset;

      const eventEl = document.createElement('div');
      eventEl.className = 'time-event';
      eventEl.textContent = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')} ${event.summary}`;
      eventEl.onclick = () => showEventDetail(event, 'day');

      // Position within timeline
      const hourSlotHeight = 60;
      const timelinePadding = 15;
      // Calculate position: each hour slot is 60px (box-sizing: border-box includes border)
      // Add timeline padding to position at correct location
      const top = timelinePadding + startOffset * hourSlotHeight;
      const height = Math.max(duration * hourSlotHeight, 30);

      eventEl.style.top = `${top}px`;
      eventEl.style.height = `${height}px`;
      eventEl.style.position = 'absolute';

      // Apply calculated layout
      if (layout.width) {
        eventEl.style.left = `${layout.left}px`;
        eventEl.style.width = `${layout.width}px`;
      } else {
        eventEl.style.left = `${layout.left}px`;
        eventEl.style.right = `${layout.right}px`;
      }

      timeline.appendChild(eventEl);
    });

    container.appendChild(timeline);

    // Function to update current time indicator
    function updateDayViewCurrentTime() {
      const today = new Date();
      let shouldShowIndicator = false;
      let displayHour = 0;
      let currentMinute = today.getMinutes();

      // Check if we should show the indicator
      if (isSameDay(date, today)) {
        // Displaying today's date
        displayHour = today.getHours();
        shouldShowIndicator = true;
      } else {
        // Check if we're displaying yesterday and it's now 0:00-1:00 (shown as 24:00-25:00)
        const tomorrow = new Date(date);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (isSameDay(tomorrow, today)) {
          displayHour = 24 + today.getHours();
          if (displayHour <= 25) {
            shouldShowIndicator = true;
          }
        }
      }

      if (shouldShowIndicator) {
        const currentOffset = displayHour + currentMinute / 60;

        // Only show if within 0:00-25:00 range
        if (currentOffset >= 0 && currentOffset <= 25) {
          const hourSlotHeight = 60;
          const timelinePadding = 15;
          // Calculate position: each hour slot is 60px (box-sizing: border-box includes border)
          // Add timeline padding to position at correct location
          const currentTimeTop = timelinePadding + currentOffset * hourSlotHeight;

          // Remove existing indicators
          const existingLabel = timeline.querySelector('.current-time-label');
          const existingLine = timeline.querySelector('.current-time-line');
          if (existingLabel) existingLabel.remove();
          if (existingLine) existingLine.remove();

          // Current time label
          const currentTimeLabel = document.createElement('div');
          currentTimeLabel.className = 'current-time-label';
          const labelHour = displayHour >= 24 ? displayHour - 24 : displayHour;
          currentTimeLabel.textContent = `${labelHour}:${currentMinute.toString().padStart(2, '0')}`;
          currentTimeLabel.style.position = 'absolute';
          currentTimeLabel.style.top = `${currentTimeTop - 12}px`;
          currentTimeLabel.style.left = '7px';
          currentTimeLabel.style.width = '50px';
          currentTimeLabel.style.height = '24px';
          currentTimeLabel.style.backgroundColor = '#ff4444';
          currentTimeLabel.style.color = 'white';
          currentTimeLabel.style.borderRadius = '12px';
          currentTimeLabel.style.display = 'flex';
          currentTimeLabel.style.alignItems = 'center';
          currentTimeLabel.style.justifyContent = 'center';
          currentTimeLabel.style.fontSize = '11px';
          currentTimeLabel.style.fontWeight = 'bold';
          currentTimeLabel.style.zIndex = '50';

          // Current time line
          const currentTimeLine = document.createElement('div');
          currentTimeLine.className = 'current-time-line';
          currentTimeLine.style.position = 'absolute';
          currentTimeLine.style.top = `${currentTimeTop}px`;
          currentTimeLine.style.left = '57px';
          currentTimeLine.style.right = '0';
          currentTimeLine.style.height = '2px';
          currentTimeLine.style.backgroundColor = '#ff4444';
          currentTimeLine.style.zIndex = '49';

          timeline.appendChild(currentTimeLine);
          timeline.appendChild(currentTimeLabel);
        } else {
          // Remove indicators if out of range
          const existingLabel = timeline.querySelector('.current-time-label');
          const existingLine = timeline.querySelector('.current-time-line');
          if (existingLabel) existingLabel.remove();
          if (existingLine) existingLine.remove();
        }
      } else {
        // Remove indicators if not showing
        const existingLabel = timeline.querySelector('.current-time-label');
        const existingLine = timeline.querySelector('.current-time-line');
        if (existingLabel) existingLabel.remove();
        if (existingLine) existingLine.remove();
      }
    }

    // Initial display of current time indicator
    updateDayViewCurrentTime();

    // Update at the start of each minute to sync with clock
    scheduleCurrentTimeUpdate(updateDayViewCurrentTime);

    // Hide loading indicator after day view is rendered
    setTimeout(() => {
      showLoading(false);
    }, 100);
  }

  function renderDetailView() {
    const container = document.getElementById('detail-view');
    container.innerHTML = '';

    if (!state.selectedEvent) return;

    const event = state.selectedEvent;

    // Header
    const header = document.createElement('div');
    header.className = 'detail-header';
    header.id = 'detail-header-main';

    // Only show back button and logo in non-embedded mode
    if (!state.embedded) {
      const backBtn = document.createElement('button');
      backBtn.className = 'back-btn';

      // Back text based on previous view and original event
      let backText = '';
      if (state.previousView === 'day') {
        const date = state.selectedDate;
        const dateStr = state.language === 'ja' ?
          `${date.getMonth() + 1}/${date.getDate()}` :
          `${date.getMonth() + 1}/${date.getDate()}`;
        backText = dateStr;
      } else if (state.previousView === 'month') {
        // Use original event's date for back button text to maintain consistency
        const originalEvent = state.originalSelectedEvent || event;
        const date = originalEvent.startDate;
        backText = translations[state.language].months[date.getMonth()];
      } else if (state.previousView === 'search') {
        // No text for search - only show back arrow
        backText = '';
      }

      if (backText) {
        const backTextSpan = document.createElement('span');
        backTextSpan.className = 'back-btn-text';
        backTextSpan.textContent = backText;
        backBtn.innerHTML = '＜';
        backBtn.appendChild(backTextSpan);
      } else {
        backBtn.textContent = '＜';
      }

      backBtn.onclick = () => {
        if (state.previousView === 'search') {
          // Return to search results without re-rendering the underlying view
          state.currentView = state.previousSearchView || 'month';

          // Show header and search bar
          const header = document.getElementById('header');
          const searchBar = document.getElementById('search-bar');
          const mainContent = document.getElementById('main-content');
          header.style.display = '';
          searchBar.style.display = '';
          searchBar.classList.add('active');
          mainContent.classList.remove('detail-view-content');

          // Switch views
          document.getElementById('detail-view').classList.remove('active');
          const viewEl = document.getElementById(`${state.currentView}-view`);
          if (viewEl) {
            viewEl.classList.add('active');
          }
          document.getElementById('search-results').classList.add('active');
        } else if (state.previousView === 'month') {
          // Set currentDate to the original event's month before switching to month view
          const originalEvent = state.originalSelectedEvent || event;
          state.currentDate = new Date(originalEvent.startDate.getFullYear(), originalEvent.startDate.getMonth(), 1);
          // Show loading indicator before switching
          showLoading(true);
          setTimeout(() => {
            switchView('month');
          }, 50);
        } else if (state.previousView === 'day') {
          // Show loading indicator before switching
          showLoading(true);
          setTimeout(() => {
            switchView(state.previousView);
          }, 50);
        } else if (state.previousView) {
          switchView(state.previousView);
        } else {
          // Show loading indicator before switching
          showLoading(true);
          setTimeout(() => {
            switchView('month');
          }, 50);
        }
      };
      header.appendChild(backBtn);

      // Add logo to the right side of header
      const logo = document.createElement('img');
      logo.id = 'detail-logo';
      logo.src = 'imgs/logo.png';
      logo.alt = 'Nij.iCal';
      logo.title = 'ホームへ';
      logo.onclick = () => {
        window.location.href = state.language === 'ja' ? './' : './index_en.html';
      };
      header.appendChild(logo);
    }

    container.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'detail-content';
    content.id = 'detail-content-main';

    // Add scroll listener to show/hide event name in header
    const mainContent = document.getElementById('main-content');
    let isScrolledPastTitle = false;

    mainContent.addEventListener('scroll', () => {
      const contentRect = content.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();

      // Check if we've scrolled past the title
      if (contentRect.top < headerRect.bottom && !isScrolledPastTitle) {
        isScrolledPastTitle = true;
        // Add event name to header (center position, before logo)
        const existingEventName = header.querySelector('.detail-header-event-name');
        if (!existingEventName) {
          const eventName = document.createElement('span');
          eventName.className = 'detail-header-event-name';
          eventName.textContent = event.summary;
          // Insert before logo
          const detailLogo = header.querySelector('#detail-logo');
          if (detailLogo) {
            header.insertBefore(eventName, detailLogo);
          } else {
            header.appendChild(eventName);
          }
        }
      } else if (contentRect.top >= headerRect.bottom && isScrolledPastTitle) {
        isScrolledPastTitle = false;
        // Remove event name from header
        const eventName = header.querySelector('.detail-header-event-name');
        if (eventName) {
          eventName.remove();
        }
      }
    });

    // Title
    const title = document.createElement('div');
    title.className = 'detail-title';
    title.textContent = event.summary;
    content.appendChild(title);

    // Location
    if (event.location) {
      const section = document.createElement('div');
      section.className = 'detail-section';

      const label = document.createElement('div');
      label.className = 'detail-label';
      label.textContent = translations[state.language].location;
      section.appendChild(label);

      const value = document.createElement('div');
      value.className = 'detail-value';
      value.textContent = event.location;
      section.appendChild(value);

      content.appendChild(section);
    }

    // Date/Time
    const dateSection = document.createElement('div');
    dateSection.className = 'detail-section';

    const dateLabel = document.createElement('div');
    dateLabel.className = 'detail-label';

    const dateValue = document.createElement('div');
    dateValue.className = 'detail-value';

    // Check if event spans multiple days
    const isMultiDay = event.startDate.getFullYear() !== event.endDate.getFullYear() ||
                       event.startDate.getMonth() !== event.endDate.getMonth() ||
                       event.startDate.getDate() !== event.endDate.getDate();

    if (event.isAllDay) {
      // All-day event
      dateLabel.textContent = state.language === 'ja' ? '日付' : 'Date';
      // For all-day events, the end date is exclusive (the day after the last day)
      const actualEndDate = new Date(event.endDate);
      actualEndDate.setDate(actualEndDate.getDate() - 1);
      // Check if it's a multi-day event
      const isMultiDayAllDay = !isSameDay(event.startDate, actualEndDate);
      if (isMultiDayAllDay) {
        dateValue.textContent = `${formatDate(event.startDate, 'YYYY/MM/DD')} - ${formatDate(actualEndDate, 'YYYY/MM/DD')}`;
      } else {
        dateValue.textContent = formatDate(event.startDate, 'YYYY/MM/DD');
      }
    } else {
      // Timed event: show date and time
      dateLabel.textContent = translations[state.language].startTime + ' - ' + translations[state.language].endTime;
      const endTimeFormat = isMultiDay ? 'YYYY/MM/DD HH:mm' : 'HH:mm';
      dateValue.textContent = `${formatDate(event.startDate, 'YYYY/MM/DD HH:mm')} - ${formatDate(event.endDate, endTimeFormat)}`;
    }

    dateSection.appendChild(dateLabel);
    dateSection.appendChild(dateValue);
    content.appendChild(dateSection);

    // Add day timeline section showing event time (max 3 hours from start time, up to next day 1:00, only for timed events)
    if (!event.isAllDay) {
      const timelineSection = document.createElement('div');
      timelineSection.className = 'detail-section';

      const timelineContainer = document.createElement('div');
      timelineContainer.className = 'detail-timeline';

      const eventStartHour = event.startDate.getHours();
      const eventStartMinute = event.startDate.getMinutes();

      // Display 3 hours starting from the event start time, up to next day 1:00 (hour 25)
      // If event starts at 0-20 minutes past the hour, start display from previous hour
      const displayStartHour = eventStartMinute <= 20 ? Math.max(0, eventStartHour - 1) : eventStartHour;
      const displayEndHour = Math.min(25, displayStartHour + 2);

      // Create hour slots for 3 hours (can extend past midnight)
      for (let hour = displayStartHour; hour <= displayEndHour; hour++) {
        const hourSlot = document.createElement('div');
        hourSlot.className = 'detail-hour-slot';

        const hourLabel = document.createElement('div');
        hourLabel.className = 'detail-hour-label';
        // Display hours past 23 as 0, 1 (next day)
        const displayHour = hour > 23 ? hour - 24 : hour;
        hourLabel.textContent = `${displayHour}:00`;
        hourSlot.appendChild(hourLabel);

        const hourContent = document.createElement('div');
        hourContent.className = 'detail-hour-content';
        hourSlot.appendChild(hourContent);

        timelineContainer.appendChild(hourSlot);
      }

      timelineContainer.style.position = 'relative';

      // Get all timed events for the same day that fall within the display window
      const eventDate = new Date(event.startDate.getFullYear(), event.startDate.getMonth(), event.startDate.getDate());
      const timedEvents = state.events.filter(e => {
        if (e.isAllDay) return false;

        const eStartDate = new Date(e.startDate.getFullYear(), e.startDate.getMonth(), e.startDate.getDate());
        const eEndDate = new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate());

        // Check if event overlaps with the selected day
        // Event overlaps if: event starts before or on eventDate AND ends on or after eventDate
        return eStartDate.getTime() <= eventDate.getTime() && eEndDate.getTime() >= eventDate.getTime();
      });

      // Filter events to only those within the display time window
      const windowStartTime = displayStartHour * 60; // in minutes from start of day
      const windowEndTime = (displayEndHour + 1) * 60; // in minutes from start of day

      const eventsInWindow = timedEvents.filter(e => {
        const eStartDate = new Date(e.startDate.getFullYear(), e.startDate.getMonth(), e.startDate.getDate());
        const eEndDate = new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate());

        // Calculate start time relative to the display day (eventDate)
        let eStartTime;
        if (eStartDate.getTime() < eventDate.getTime()) {
          // Event started before the display day - treat as starting at 0:00
          eStartTime = 0;
        } else {
          // Event starts on the display day - use actual start time
          eStartTime = e.startDate.getHours() * 60 + e.startDate.getMinutes();
        }

        // Calculate end time relative to the display day
        let eEndTime;
        if (eEndDate.getTime() > eventDate.getTime()) {
          // Event ends after the display day - calculate as hours past midnight
          const daysDiff = Math.floor((eEndDate.getTime() - eventDate.getTime()) / (24 * 60 * 60 * 1000));
          eEndTime = (e.endDate.getHours() * 60 + e.endDate.getMinutes()) + (daysDiff * 24 * 60);
        } else {
          // Event ends on the display day - use actual end time
          eEndTime = e.endDate.getHours() * 60 + e.endDate.getMinutes();
        }

        // Check if event overlaps with display window
        return eEndTime > windowStartTime && eStartTime < windowEndTime;
      });

      // Use the same layout calculation as day view
      const eventsWithLayout = calculateDayEventLayout(eventsInWindow, event.startDate);

      // Render all events in the window
      const hourSlotHeight = 60;
      eventsWithLayout.forEach(evt => {
        // Calculate position relative to display window start
        const startOffsetFromDisplayStart = evt.startOffset - displayStartHour;
        const endOffsetFromDisplayStart = evt.endOffset - displayStartHour;

        // Only render if event is within display window
        if (endOffsetFromDisplayStart > 0 && startOffsetFromDisplayStart < (displayEndHour - displayStartHour + 1)) {
          const clampedStart = Math.max(0, startOffsetFromDisplayStart);
          const clampedEnd = Math.min(displayEndHour - displayStartHour + 1, endOffsetFromDisplayStart);
          const duration = clampedEnd - clampedStart;

          const eventEl = document.createElement('div');
          eventEl.className = 'detail-time-event';
          // Highlight the selected event
          if (evt.event === event) {
            eventEl.classList.add('selected');
          }
          eventEl.textContent = `${String(evt.startHour).padStart(2, '0')}:${String(evt.startMinute).padStart(2, '0')} ${evt.event.summary}`;

          const top = clampedStart * hourSlotHeight;
          const height = Math.max(duration * hourSlotHeight, 30);

          eventEl.style.top = `${top}px`;
          eventEl.style.height = `${height}px`;
          eventEl.style.position = 'absolute';

          // Use layout information from calculateDayEventLayout
          if (evt.layout) {
            eventEl.style.left = `${evt.layout.left}px`;
            eventEl.style.width = `${evt.layout.width}px`;
          } else {
            eventEl.style.left = '65px';
            eventEl.style.right = '10px';
          }

          // Make other events clickable
          if (evt.event !== event) {
            eventEl.style.cursor = 'pointer';
            eventEl.onclick = (e) => {
              e.stopPropagation();
              showEventDetail(evt.event, 'detail');
            };
          }

          timelineContainer.appendChild(eventEl);
        }
      });

      // Function to update current time indicator
      function updateDetailViewCurrentTime() {
        const today = new Date();
        const eventDate = new Date(event.startDate.getFullYear(), event.startDate.getMonth(), event.startDate.getDate());
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        let shouldShowIndicator = false;
        let displayCurrentHour = 0;
        const currentMinute = today.getMinutes();

        // Check if we should show the indicator
        if (eventDate.getTime() === todayDate.getTime()) {
          // Event starts today
          displayCurrentHour = today.getHours();
          shouldShowIndicator = true;
        } else {
          // Check if event started yesterday and timeline extends to today (past midnight)
          const nextDay = new Date(eventDate);
          nextDay.setDate(nextDay.getDate() + 1);
          if (nextDay.getTime() === todayDate.getTime() && displayEndHour > 24) {
            displayCurrentHour = 24 + today.getHours();
            shouldShowIndicator = true;
          }
        }

        // Remove existing indicators
        const existingLabel = timelineContainer.querySelector('.current-time-label');
        const existingLine = timelineContainer.querySelector('.current-time-line');
        if (existingLabel) existingLabel.remove();
        if (existingLine) existingLine.remove();

        if (shouldShowIndicator) {
          // Check if current time is within the display range
          if (displayCurrentHour >= displayStartHour && displayCurrentHour <= displayEndHour) {
            const offsetFromDisplayStart = (displayCurrentHour - displayStartHour) + currentMinute / 60;
            // Calculate position: each hour slot is 60px (box-sizing: border-box includes border)
            const currentTimeTop = offsetFromDisplayStart * hourSlotHeight;

            // Current time line
            const currentTimeLine = document.createElement('div');
            currentTimeLine.className = 'current-time-line';
            currentTimeLine.style.position = 'absolute';
            currentTimeLine.style.top = `${currentTimeTop}px`;
            currentTimeLine.style.left = '62px';
            currentTimeLine.style.right = '10px';
            currentTimeLine.style.height = '2px';
            currentTimeLine.style.backgroundColor = '#ff4444';
            currentTimeLine.style.zIndex = '50';

            // Current time label
            const currentTimeLabel = document.createElement('div');
            currentTimeLabel.className = 'current-time-label';
            const labelHour = displayCurrentHour >= 24 ? displayCurrentHour - 24 : displayCurrentHour;
            currentTimeLabel.textContent = `${labelHour}:${currentMinute.toString().padStart(2, '0')}`;
            currentTimeLabel.style.position = 'absolute';
            currentTimeLabel.style.top = `${currentTimeTop - 12}px`;
            currentTimeLabel.style.left = '12px';
            currentTimeLabel.style.width = '50px';
            currentTimeLabel.style.height = '24px';
            currentTimeLabel.style.backgroundColor = '#ff4444';
            currentTimeLabel.style.color = 'white';
            currentTimeLabel.style.borderRadius = '12px';
            currentTimeLabel.style.display = 'flex';
            currentTimeLabel.style.alignItems = 'center';
            currentTimeLabel.style.justifyContent = 'center';
            currentTimeLabel.style.fontSize = '11px';
            currentTimeLabel.style.fontWeight = 'bold';
            currentTimeLabel.style.zIndex = '49';

            timelineContainer.appendChild(currentTimeLine);
            timelineContainer.appendChild(currentTimeLabel);
          }
        }
      }

      // Initial display of current time indicator
      updateDetailViewCurrentTime();

      // Update at the start of each minute to sync with clock
      scheduleCurrentTimeUpdate(updateDetailViewCurrentTime);

      timelineSection.appendChild(timelineContainer);
      content.appendChild(timelineSection);
    }

    // URL
    if (event.url) {
      const section = document.createElement('div');
      section.className = 'detail-section';

      const label = document.createElement('div');
      label.className = 'detail-label';
      label.textContent = translations[state.language].url;
      section.appendChild(label);

      const value = document.createElement('a');
      value.className = 'detail-url';
      value.href = event.url;
      value.target = '_blank';
      value.textContent = event.url;
      section.appendChild(value);

      content.appendChild(section);
    }

    // Description
    if (event.description) {
      const section = document.createElement('div');
      section.className = 'detail-section';

      const label = document.createElement('div');
      label.className = 'detail-label';
      label.textContent = translations[state.language].description;
      section.appendChild(label);

      const value = document.createElement('div');
      value.className = 'detail-value';
      value.style.whiteSpace = 'pre-wrap';

      // Convert URLs in description to links
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const descriptionParts = event.description.split(urlRegex);

      descriptionParts.forEach((part, index) => {
        if (part.match(urlRegex)) {
          const link = document.createElement('a');
          link.href = part;
          link.target = '_blank';
          link.className = 'detail-url';
          link.textContent = part;
          value.appendChild(link);
        } else {
          value.appendChild(document.createTextNode(part));
        }
      });

      section.appendChild(value);

      content.appendChild(section);
    }

    // Map (if geo exists and not in embedded mode)
    if (event.geo && !state.embedded) {
      const section = document.createElement('div');
      section.className = 'detail-section';

      const label = document.createElement('div');
      label.className = 'detail-label';
      label.textContent = translations[state.language].map;
      section.appendChild(label);

      const mapContainer = document.createElement('div');
      mapContainer.className = 'detail-map-container';
      mapContainer.id = 'detail-map-container';

      const mapDiv = document.createElement('div');
      mapDiv.id = 'detail-map';
      mapContainer.appendChild(mapDiv);

      section.appendChild(mapContainer);
      content.appendChild(section);

      // Initialize map after container is added to DOM
      setTimeout(() => {
        const map = L.map('detail-map', {
          center: [event.geo.lat, event.geo.lng],
          zoom: 15,
          zoomControl: false,
          dragging: false,
          touchZoom: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          tap: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        const marker = L.marker([event.geo.lat, event.geo.lng]).addTo(map);
        if (event.location) {
          marker.bindPopup(event.location);
        }

        // Add overlay to make map clickable to go to map.html
        const overlay = document.createElement('div');
        overlay.className = 'map-overlay';
        overlay.onclick = () => {
          // Build URL with lat, lng, marker position, and language parameters
          const params = new URLSearchParams({
            lat: event.geo.lat,
            lng: event.geo.lng,
            marker: `${event.geo.lat},${event.geo.lng}`,
            lang: state.language
          });

          // Add performer parameter if a specific calendar is selected
          if (state.selectedCalendar !== 'events') {
            // Find the talent corresponding to the selected calendar
            const talent = state.talents.find(t => t.filename.replace('.ics', '') === state.selectedCalendar);
            if (talent) {
              // Use Japanese name for performer parameter
              params.set('performer', talent.name);
            }
          }

          window.location.href = `map.html?${params.toString()}`;
        };
        mapContainer.appendChild(overlay);
      }, 100);
    }

    container.appendChild(content);

    // Reset scroll position to top
    mainContent.scrollTop = 0;
  }

  // View switching
  // URL parameter management
  function updateURL() {
    const params = new URLSearchParams();

    // Add language parameter (only if not default 'ja')
    if (state.language !== 'ja') {
      params.set('lang', state.language);
    }

    // Add calendar parameter (only if not default 'events')
    if (state.selectedCalendar !== 'events') {
      params.set('calendar', state.selectedCalendar);
    }

    if (state.currentView === 'detail' && state.selectedEvent) {
      params.set('view', 'detail');
      params.set('event', getEventId(state.selectedEvent));
      if (state.previousView && state.previousView !== 'search') {
        params.set('from', state.previousView);
      }
    } else if (state.currentView === 'year') {
      params.set('view', 'year');
      params.set('date', formatDateForURL(state.currentDate));
    } else if (state.currentView === 'month') {
      params.set('view', 'month');
      params.set('date', formatDateForURL(state.currentDate));
    } else if (state.currentView === 'day') {
      params.set('view', 'day');
      params.set('date', formatDateForURL(state.selectedDate));
    }

    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({ view: state.currentView }, '', newURL);
  }

  function getEventId(event) {
    // Create a unique ID from event summary and start date
    const dateStr = `${event.startDate.getFullYear()}-${event.startDate.getMonth()}-${event.startDate.getDate()}-${event.startDate.getHours()}-${event.startDate.getMinutes()}`;
    return btoa(encodeURIComponent(`${event.summary}-${dateStr}`)).replace(/=/g, '');
  }

  function findEventById(eventId) {
    for (const event of state.events) {
      if (getEventId(event) === eventId) {
        return event;
      }
    }
    return null;
  }

  function formatDateForURL(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateFromURL(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function switchView(view) {
    state.previousView = state.currentView;
    state.currentView = view;

    // Update URL
    updateURL();

    // Show loading indicator when switching views
    if (view === 'month' || view === 'year' || view === 'day') {
      showLoading(true);
      // Use setTimeout to ensure loading indicator is displayed
      setTimeout(() => {
        renderCurrentView();
      }, 10);
    } else {
      renderCurrentView();
    }
  }

  function showEventDetail(event, fromView) {
    state.selectedEvent = event;
    if (fromView === 'search') {
      state.previousView = 'search';
      state.previousSearchView = state.currentView;
      state.originalSelectedEvent = event; // Save original event for back button
      // Hide search results when showing detail
      document.getElementById('search-results').classList.remove('active');
      // Switch to detail view without overriding previousView
      state.currentView = 'detail';
      updateURL();
      renderCurrentView();
    } else if (fromView === 'detail') {
      // When navigating from detail to detail, keep the original previousView and originalSelectedEvent
      // Just update the selected event and re-render
      state.currentView = 'detail';
      updateURL();
      renderCurrentView();
    } else {
      state.previousView = fromView;
      state.originalSelectedEvent = event; // Save original event for back button
      switchView('detail');
    }
  }

  // Search functionality
  function performSearch(query) {
    if (!query || query.trim() === '') {
      document.getElementById('search-results').classList.remove('active');
      return;
    }

    const terms = query.toLowerCase().split(' ').filter(t => t);
    const results = state.events.filter(event => {
      const searchText = `${event.summary} ${event.description} ${event.location}`.toLowerCase();
      return terms.every(term => searchText.includes(term));
    });

    renderSearchResults(results);
  }

  function renderSearchResults(results) {
    const container = document.getElementById('search-results');
    container.innerHTML = '';
    container.classList.add('active');

    if (results.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 20px;">${translations[state.language].noEvents}</div>`;
      return;
    }

    // Sort by date (all events in chronological order)
    const sortedResults = results.sort((a, b) => a.startDate - b.startDate);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let firstFutureIndex = -1;

    sortedResults.forEach((event, index) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';

      const isPast = event.startDate < today;
      if (isPast) {
        item.classList.add('past-event');
      } else if (firstFutureIndex === -1) {
        firstFutureIndex = index;
      }

      const dateDiv = document.createElement('div');
      dateDiv.className = 'search-result-date';
      dateDiv.textContent = formatDate(event.startDate, 'YYYY/MM/DD');
      item.appendChild(dateDiv);

      const titleDiv = document.createElement('div');
      titleDiv.className = 'search-result-title';
      titleDiv.textContent = event.summary;
      item.appendChild(titleDiv);

      if (event.location) {
        const locationDiv = document.createElement('div');
        locationDiv.textContent = event.location;
        locationDiv.style.fontSize = '12px';
        locationDiv.style.color = '#666';
        item.appendChild(locationDiv);
      }

      item.onclick = () => {
        showEventDetail(event, 'search');
      };

      container.appendChild(item);
    });

    // Scroll to first future event
    if (firstFutureIndex >= 0) {
      setTimeout(() => {
        const items = container.querySelectorAll('.search-result-item');
        if (items[firstFutureIndex]) {
          items[firstFutureIndex].scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }, 100);
    }
  }

  // Event listeners
  function updateUIText() {
    // Update loading text
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.textContent = translations[state.language].loading;
    }

    // Update today button text
    const todayBtn = document.getElementById('today-btn');
    if (todayBtn) {
      todayBtn.textContent = translations[state.language].today;
    }

    // Update search placeholder
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.placeholder = translations[state.language].search + '...';
    }

    // Update calendar button title
    const calendarBtn = document.getElementById('calendar-btn');
    if (calendarBtn) {
      calendarBtn.title = translations[state.language].calendar;
    }

    // Update language button title
    const languageBtn = document.getElementById('language-btn');
    if (languageBtn) {
      languageBtn.title = translations[state.language].language;
    }

    // Update calendar modal title
    const calendarModal = document.getElementById('calendar-modal');
    if (calendarModal) {
      const calendarModalTitle = calendarModal.querySelector('.modal-title');
      if (calendarModalTitle) {
        calendarModalTitle.textContent = translations[state.language].calendar;
      }
    }

    // Update language modal title
    const languageModal = document.getElementById('language-modal');
    if (languageModal) {
      const languageModalTitle = languageModal.querySelector('.modal-title');
      if (languageModalTitle) {
        languageModalTitle.textContent = translations[state.language].language;
      }
    }
  }

  function setupEventListeners() {
    // Logo click
    document.getElementById('logo').onclick = () => {
      window.location.href = state.language === 'ja' ? './' : './index_en.html';
    };

    // Search button
    document.getElementById('search-btn').onclick = () => {
      document.getElementById('search-bar').classList.add('active');
      document.getElementById('search-input').focus();
    };

    // Search close
    document.getElementById('search-close').onclick = () => {
      document.getElementById('search-bar').classList.remove('active');
      document.getElementById('search-input').value = '';
      document.getElementById('search-results').classList.remove('active');

      // Restore header for current view
      if (state.currentView === 'month') {
        updateHeaderForMonthView();
      } else if (state.currentView === 'year' || state.currentView === 'day') {
        restoreNormalHeader();
      }
    };

    // Search input
    let searchTimeout;
    document.getElementById('search-input').oninput = (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(e.target.value);
      }, 300);
    };

    // Hide keyboard on Enter key (but not during IME composition)
    document.getElementById('search-input').onkeydown = (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.target.blur();
      }
    };

    // Today button
    document.getElementById('today-btn').onclick = () => {
      const today = new Date();

      if (state.currentView === 'year') {
        // In year view: scroll to today's date or go to month view
        const todayElement = document.querySelector('.mini-day.today');

        if (todayElement) {
          const rect = todayElement.getBoundingClientRect();

          // Check if today's date is visible in viewport
          if (rect.top >= 60 && rect.bottom <= window.innerHeight - 70) {
            // Already visible, go to month view
            state.currentDate = today;
            showLoading(true);
            setTimeout(() => {
              switchView('month');
            }, 50);
          } else {
            // Not visible, scroll to today's year
            const yearContainer = todayElement.closest('.year-container');
            if (yearContainer) {
              const mainContent = document.getElementById('main-content');
              const currentScroll = mainContent.scrollTop;
              const yearRect = yearContainer.getBoundingClientRect();
              const containerTop = yearRect.top + currentScroll - mainContent.getBoundingClientRect().top;
              mainContent.scrollTo({ top: containerTop - 80, behavior: 'smooth' });
            }
          }
        } else {
          // Today not rendered yet, go to month view
          state.currentDate = today;
          showLoading(true);
          setTimeout(() => {
            switchView('month');
          }, 50);
        }
      } else if (state.currentView === 'month') {
        // In month view: scroll to today's date or go to day view
        const targetDate = `${today.getFullYear()}-${today.getMonth()}`;
        const targetSection = document.querySelector(`.month-section[data-date="${targetDate}"]`);

        if (targetSection) {
          // Find today's date element within the month section
          const todayDateElement = targetSection.querySelector('.day-number.today');

          if (todayDateElement) {
            const rect = todayDateElement.getBoundingClientRect();
            const mainContent = document.getElementById('main-content');

            // Check if today's date is visible in viewport
            if (rect.top >= 130 && rect.bottom <= window.innerHeight - 80) {
              // Already visible, go to day view
              state.selectedDate = today;
              showLoading(true);
              setTimeout(() => {
                switchView('day');
              }, 50);
            } else {
              // Not visible, scroll to today's month
              targetSection.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
          } else {
            // Couldn't find today's date element, just scroll to the section
            targetSection.scrollIntoView({ block: 'start', behavior: 'smooth' });
          }
        } else {
          state.currentDate = today;
          state.selectedDate = today;
          renderMonthView();
        }
      } else if (state.currentView === 'day') {
        // In day view: go to today if not already there
        if (!isSameDay(state.selectedDate, today)) {
          state.selectedDate = today;
          renderDayView();
        }
      } else if (state.currentView === 'search') {
        // In search view: scroll to today
        scrollToTodayInSearch();
      }
    };

    function scrollToTodayInSearch() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const items = document.querySelectorAll('.search-result-item');
      for (let i = 0; i < items.length; i++) {
        const dateText = items[i].querySelector('.search-result-date').textContent;
        const [year, month, day] = dateText.split('/').map(Number);
        const itemDate = new Date(year, month - 1, day);

        if (itemDate >= today) {
          items[i].scrollIntoView({ block: 'start', behavior: 'smooth' });
          break;
        }
      }
    }

    // Calendar selection button
    document.getElementById('calendar-btn').onclick = () => {
      showCalendarModal();
    };


    // Language modal clicks
    document.getElementById('language-modal').onclick = (e) => {
      if (e.target.closest('.modal-list li')) {
        const lang = e.target.closest('li').dataset.lang;
        if (lang !== state.language) {
          state.language = lang;
          document.documentElement.lang = lang;
          updateUIText(); // Update UI text based on new language
          sortTalents(); // Re-sort talents based on new language
          showLoading(true); // Show loading indicator first
          const filename = state.selectedCalendar === 'events' ? 'events.ics' : state.selectedCalendar + '.ics';
          // Wait for UI to update, then close modal and load
          setTimeout(() => {
            document.getElementById('language-modal').classList.remove('active');
            setTimeout(() => {
              loadCalendar(filename);
              updateURL(); // Update URL to reflect language change
            }, 50);
          }, 10);
        } else {
          document.getElementById('language-modal').classList.remove('active');
        }
      } else if (e.target === document.getElementById('language-modal')) {
        document.getElementById('language-modal').classList.remove('active');
      }
    };

    // Update language modal to show selected language
    document.getElementById('language-btn').onclick = () => {
      const modal = document.getElementById('language-modal');
      const items = modal.querySelectorAll('.modal-list li');

      items.forEach(item => {
        if (item.dataset.lang === state.language) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });

      modal.classList.add('active');
    };

    // Calendar modal close on background click
    document.getElementById('calendar-modal').onclick = (e) => {
      if (e.target === document.getElementById('calendar-modal')) {
        document.getElementById('calendar-modal').classList.remove('active');
      }
    };
  }

  function showCalendarModal() {
    const modal = document.getElementById('calendar-modal');
    const list = document.getElementById('calendar-list');
    list.innerHTML = '';

    // Sort talents before displaying
    sortTalents();

    let selectedItem = null;

    // Add "All" option
    const allItem = document.createElement('li');
    allItem.textContent = translations[state.language].all;
    if (state.selectedCalendar === 'events') {
      allItem.classList.add('selected');
      selectedItem = allItem;
    }
    allItem.onclick = () => {
      state.selectedCalendar = 'events';
      showLoading(true); // Show loading indicator first
      // Wait for UI to update, then close modal and load
      setTimeout(() => {
        modal.classList.remove('active');
        setTimeout(() => {
          loadCalendar('events.ics');
          updateURL(); // Update URL to reflect calendar change
        }, 50);
      }, 10);
    };
    list.appendChild(allItem);

    // Add talent options
    state.talents.forEach(talent => {
      const item = document.createElement('li');
      item.textContent = state.language === 'ja' ? talent.name : talent.romaji;
      if (state.selectedCalendar === talent.filename.replace('.ics', '')) {
        item.classList.add('selected');
        selectedItem = item;
      }
      item.onclick = () => {
        state.selectedCalendar = talent.filename.replace('.ics', '');
        showLoading(true); // Show loading indicator first
        // Wait for UI to update, then close modal and load
        setTimeout(() => {
          modal.classList.remove('active');
          setTimeout(() => {
            loadCalendar(talent.filename);
            updateURL(); // Update URL to reflect calendar change
          }, 50);
        }, 10);
      };
      list.appendChild(item);
    });

    modal.classList.add('active');

    // Scroll to selected item
    if (selectedItem) {
      setTimeout(() => {
        selectedItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 100);
    }
  }

  // Initialize
  function loadFromURL() {
    const params = new URLSearchParams(window.location.search);

    // Load language parameter
    const lang = params.get('lang') || 'ja';
    const languageChanged = state.language !== lang;
    if (lang && (lang === 'ja' || lang === 'en')) {
      state.language = lang;
      document.documentElement.lang = lang;
      if (languageChanged) {
        updateUIText();
        sortTalents();
      }
    }

    // Load calendar parameter
    const calendar = params.get('calendar') || 'events';
    const calendarChanged = state.selectedCalendar !== calendar;
    if (calendar) {
      state.selectedCalendar = calendar;
    }

    // Reload calendar if it changed
    if (calendarChanged) {
      const calendarFile = state.selectedCalendar === 'events' ? 'events.ics' : state.selectedCalendar + '.ics';
      loadCalendar(calendarFile);
      return true; // Return early as loadCalendar will render
    }

    const view = params.get('view');
    const dateStr = params.get('date');
    const eventId = params.get('event');
    const from = params.get('from');

    if (view === 'detail' && eventId) {
      const event = findEventById(eventId);
      if (event) {
        state.selectedEvent = event;
        state.currentView = 'detail';
        state.previousView = from || 'month';
        renderCurrentView();
        return true;
      }
    } else if (view === 'year' && dateStr) {
      state.currentDate = parseDateFromURL(dateStr);
      state.currentView = 'year';
      renderCurrentView();
      return true;
    } else if (view === 'day' && dateStr) {
      state.selectedDate = parseDateFromURL(dateStr);
      state.currentView = 'day';
      renderCurrentView();
      return true;
    } else if (view === 'month' && dateStr) {
      state.currentDate = parseDateFromURL(dateStr);
      state.currentView = 'month';
      renderCurrentView();
      return true;
    }

    return false;
  }

  // Check for date changes and update display
  function checkDateChange() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const savedToday = new Date(state.todayDate.getFullYear(), state.todayDate.getMonth(), state.todayDate.getDate());

    if (today.getTime() !== savedToday.getTime()) {
      // Date has changed
      state.todayDate = now;

      // Re-render current view to update "today" indicators
      if (state.currentView === 'month' || state.currentView === 'year' || state.currentView === 'day') {
        renderCurrentView();
      }
    }
  }

  async function init() {
    // Read URL parameters first (for language and calendar)
    const params = new URLSearchParams(window.location.search);
    const lang = params.get('lang');
    if (lang && (lang === 'ja' || lang === 'en')) {
      state.language = lang;
      document.documentElement.lang = lang;
    }
    const calendar = params.get('calendar');
    if (calendar) {
      state.selectedCalendar = calendar;
    }

    // Check if in embedded mode (from iframe)
    const embedded = params.get('embedded');
    if (embedded === 'true') {
      state.embedded = true;
      // Add embedded class to body to hide certain UI elements
      document.body.classList.add('embedded-mode');
    }

    // Update UI text based on current language
    updateUIText();

    // Ensure loading indicator is shown from the start
    showLoading(true);

    setupEventListeners();

    // Wait a moment to ensure loading indicator is rendered
    await new Promise(resolve => setTimeout(resolve, 50));

    // Load talents and calendar data
    await loadTalents();
    // Load the calendar specified in URL or default to events.ics
    const calendarFile = state.selectedCalendar === 'events' ? 'events.ics' : state.selectedCalendar + '.ics';
    await loadCalendar(calendarFile);

    // Check if URL has parameters and load corresponding view
    const loadedFromURL = loadFromURL();

    // If no URL params, update URL to reflect default view (month)
    if (!loadedFromURL) {
      updateURL();
    }

    // Start checking for date changes every minute
    if (state.dateCheckInterval) {
      clearInterval(state.dateCheckInterval);
    }
    state.dateCheckInterval = setInterval(checkDateChange, 60000);
  }

  // Handle browser back/forward buttons
  window.addEventListener('popstate', (event) => {
    loadFromURL();
  });

  // Start the application
  document.addEventListener('DOMContentLoaded', init);
})();
