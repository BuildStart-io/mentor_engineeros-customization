import React, { useMemo } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Car, Wallet, Clock } from 'lucide-react';

const localizer = momentLocalizer(moment);

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  status: string;
  created_at: string;
  custom_fields?: Record<string, any> | null;
}

interface DetailingCalendarProps {
  orders: Order[];
}

export default function DetailingCalendar({ orders }: DetailingCalendarProps) {
  const events = useMemo(() => {
    const parsedEvents = orders
      .filter(o => {
        const cf = o.custom_fields;
        if (!cf) return false;
        const cat = (cf.service_category || '').toLowerCase();
        return (
          cat === 'detailing' || 
          cat === 'detailing & polish' ||
          (Array.isArray(cf.add_ons) && cf.add_ons.some((a: string) => a.toLowerCase().includes('detail')))
        );
      })
      .map(o => {
        // Fallback to order creation date if no explicit booking_date
        const dateStr = o.custom_fields?.booking_date || moment(o.created_at).format('YYYY-MM-DD');
        if (!dateStr) return null;
        
        // 8:30 AM arrival time
        // If dateStr is somehow invalid, moment will fallback to Invalid Date, but we try our best.
        let start = moment(`${dateStr}T08:30:00`).toDate();
        let end = moment(`${dateStr}T17:30:00`).toDate(); // Assume full day job

        // Safety check if date parsed incorrectly
        if (isNaN(start.getTime())) {
           start = moment(o.created_at).set({ hour: 8, minute: 30, second: 0 }).toDate();
           end = moment(o.created_at).set({ hour: 17, minute: 30, second: 0 }).toDate();
        }
        
        return {
          id: o.id,
          title: o.customer_name,
          start,
          end,
          resource: o
        };
      })
      .filter(Boolean);
      
    return parsedEvents;
  }, [orders]);

  const CustomEvent = ({ event }: any) => {
    const o = event.resource as Order;
    const cf = o.custom_fields || {};
    
    return (
      <div className="p-1.5 h-full flex flex-col gap-1 overflow-hidden text-xs">
        <div className="font-bold truncate text-[13px]">{o.customer_name}</div>
        <div className="flex items-center gap-1.5 truncate text-white/90">
          <Phone className="h-3 w-3 shrink-0" />
          <span>{o.customer_phone}</span>
        </div>
        <div className="flex items-center gap-1.5 truncate text-white/90">
          <Car className="h-3 w-3 shrink-0" />
          <span>{cf.vehicle_number || "No Plate"}</span>
        </div>
        <div className="flex items-center gap-1.5 truncate text-white/90">
          <Wallet className="h-3 w-3 shrink-0" />
          <span>LKR {o.total_amount.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1.5 truncate text-white/90">
          <Clock className="h-3 w-3 shrink-0" />
          <span>8:30 AM</span>
        </div>
      </div>
    );
  };

  return (
    <Card className="mt-6 border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl flex items-center gap-2">
          Detailing Service Calendar
          <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
            Max 1 Vehicle / Day
          </Badge>
        </CardTitle>
        <CardDescription>
          View all scheduled detailing jobs. Tuesdays and Poya days are automatically blocked in the system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[750px] w-full rounded-md border p-4 bg-white dark:bg-slate-950 shadow-inner">
          <style dangerouslySetInnerHTML={{__html: `
            .rbc-calendar { font-family: inherit; }
            .rbc-event { padding: 0 !important; border: none !important; }
            .rbc-event-content { height: 100%; }
            .rbc-today { background-color: rgba(59, 130, 246, 0.05); }
            .rbc-off-range-bg { background-color: rgba(0, 0, 0, 0.02); }
            .dark .rbc-off-range-bg { background-color: rgba(255, 255, 255, 0.02); }
            .dark .rbc-month-view, .dark .rbc-month-row, .dark .rbc-header { border-color: rgba(255, 255, 255, 0.1); }
            .dark .rbc-day-bg { border-left-color: rgba(255, 255, 255, 0.1); }
          `}} />
          <Calendar
            localizer={localizer}
            events={events as any}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            views={['month', 'week', 'day']}
            defaultView="month"
            components={{
              event: CustomEvent
            }}
            eventPropGetter={() => ({
              className: 'bg-blue-600 text-white border border-blue-700 shadow-sm rounded-md hover:brightness-110 transition-all',
              style: { minHeight: '110px' }
            })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
