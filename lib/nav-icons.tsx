// The icons admins can give a menu section (Settings → Navigation). A curated set,
// imported one by one: the full lucide `icons` namespace would ship ~1,500 icons to
// every page. Saved layouts store the name; the server only accepts names listed here.

import {
  type LucideIcon,
  Users, User, UserCog, UserPlus, UsersRound, Contact, IdCard, Crown, Smile, Baby, Handshake, HeartHandshake,
  ClipboardList, ClipboardCheck, Clipboard, ListChecks, ListTodo, CheckSquare, NotebookPen, PenLine,
  CalendarRange, Calendar, CalendarDays, CalendarClock, Clock, Timer, History,
  LayoutDashboard, LayoutGrid, KanbanSquare, Table, Layers, Grid3x3,
  Stethoscope, HeartPulse, Activity, Bone, Pill, Syringe, Hospital, Ambulance, Cross, Brain, Accessibility,
  Eye, Ear, Scan, Microscope, FlaskConical, TestTube, Thermometer,
  PhoneIncoming, Phone, PhoneCall, MessageCircle, MessageSquare, Mail, Inbox, Send, Megaphone, Bell, AtSign, Radio, Headphones,
  BarChart3, LineChart, PieChart, TrendingUp, Gauge, Target,
  Workflow, Zap, Bot, Sparkles, Repeat, RefreshCw,
  Settings, Wrench, SlidersHorizontal, Hammer, Puzzle,
  Box, Boxes, Package, Archive, Folder, FolderOpen, FileText, Files, FileSpreadsheet, Paperclip, Bookmark, Newspaper,
  Image, Camera, Video, Monitor, Smartphone, Printer,
  BookOpen, GraduationCap, School, Award, Trophy, Medal, Dumbbell, Bike, Footprints, Flag, Star, Heart, Gem, Lightbulb, Rocket,
  Building2, Building, Home, Store, Landmark, MapPin, Map, Globe, Compass, Route, Signpost, Truck, Plane, Car,
  Briefcase, DollarSign, CreditCard, Receipt, Wallet, PiggyBank, ShoppingCart, Tag, Tags, Scale, Gavel,
  Shield, ShieldCheck, Lock, Key, BadgeCheck, Database, Server, Cloud, Network, Share2, Link, Hash, Search,
} from "lucide-react"

export interface NavIconDef { Icon: LucideIcon; keywords: string }

const i = (Icon: LucideIcon, keywords = ""): NavIconDef => ({ Icon, keywords })

/** name → icon, in the order the picker shows them. */
export const NAV_ICONS: Record<string, NavIconDef> = {
  // People
  Users: i(Users, "people team group referrals contacts"), User: i(User, "person profile"), UserCog: i(UserCog, "account admin"),
  UserPlus: i(UserPlus, "add person new patient"), UsersRound: i(UsersRound, "people team"), Contact: i(Contact, "contact card address book"),
  IdCard: i(IdCard, "id badge member"), Crown: i(Crown, "vip owner"), Smile: i(Smile, "patient happy satisfaction"),
  Baby: i(Baby, "pediatrics child"), Handshake: i(Handshake, "partners deal agreement"), HeartHandshake: i(HeartHandshake, "care support community"),
  // Lists & tasks
  ClipboardList: i(ClipboardList, "list appointments intake"), ClipboardCheck: i(ClipboardCheck, "done check approval"), Clipboard: i(Clipboard, "notes"),
  ListChecks: i(ListChecks, "tasks checklist"), ListTodo: i(ListTodo, "tasks todo"), CheckSquare: i(CheckSquare, "tasks done"),
  NotebookPen: i(NotebookPen, "notes journal"), PenLine: i(PenLine, "write edit sign"),
  // Time
  CalendarRange: i(CalendarRange, "schedule calendar dates"), Calendar: i(Calendar, "calendar date"), CalendarDays: i(CalendarDays, "calendar month"),
  CalendarClock: i(CalendarClock, "appointment schedule time"), Clock: i(Clock, "time hours"), Timer: i(Timer, "stopwatch duration"), History: i(History, "log past recent"),
  // Layout
  LayoutDashboard: i(LayoutDashboard, "dashboard overview"), LayoutGrid: i(LayoutGrid, "grid apps"), KanbanSquare: i(KanbanSquare, "board pipeline kanban"),
  Table: i(Table, "table spreadsheet list"), Layers: i(Layers, "stack layers"), Grid3x3: i(Grid3x3, "grid matrix"),
  // Medical
  Stethoscope: i(Stethoscope, "doctor medical surgery provider"), HeartPulse: i(HeartPulse, "health cardio vitals"), Activity: i(Activity, "pulse vitals activity"),
  Bone: i(Bone, "ortho orthopedic bone joint"), Pill: i(Pill, "medication pharmacy"), Syringe: i(Syringe, "injection vaccine"),
  Hospital: i(Hospital, "hospital clinic"), Ambulance: i(Ambulance, "emergency er"), Cross: i(Cross, "medical health"),
  Brain: i(Brain, "neuro mind"), Accessibility: i(Accessibility, "disability access"), Eye: i(Eye, "vision view"), Ear: i(Ear, "hearing ent"),
  Scan: i(Scan, "imaging mri ct xray scan"), Microscope: i(Microscope, "lab research"), FlaskConical: i(FlaskConical, "lab test"),
  TestTube: i(TestTube, "lab sample"), Thermometer: i(Thermometer, "temperature fever"),
  // Communication
  PhoneIncoming: i(PhoneIncoming, "calls on-call incoming"), Phone: i(Phone, "call phone"), PhoneCall: i(PhoneCall, "call ringing"),
  MessageCircle: i(MessageCircle, "chat sms messages communications"), MessageSquare: i(MessageSquare, "chat comments"), Mail: i(Mail, "email letters"),
  Inbox: i(Inbox, "inbox messages"), Send: i(Send, "send outreach"), Megaphone: i(Megaphone, "broadcast marketing announce"),
  Bell: i(Bell, "notifications alerts"), AtSign: i(AtSign, "email mention"), Radio: i(Radio, "broadcast"), Headphones: i(Headphones, "support call center"),
  // Reporting
  BarChart3: i(BarChart3, "reports analytics chart"), LineChart: i(LineChart, "trend chart"), PieChart: i(PieChart, "share chart"),
  TrendingUp: i(TrendingUp, "growth trend"), Gauge: i(Gauge, "kpi performance"), Target: i(Target, "goals target"),
  // Automation
  Workflow: i(Workflow, "automations workflows"), Zap: i(Zap, "automation trigger fast"), Bot: i(Bot, "ai robot assistant"),
  Sparkles: i(Sparkles, "ai magic new"), Repeat: i(Repeat, "recurring repeat"), RefreshCw: i(RefreshCw, "sync reconcile"),
  // Tools
  Settings: i(Settings, "settings admin config"), Wrench: i(Wrench, "tools maintenance"), SlidersHorizontal: i(SlidersHorizontal, "controls preferences"),
  Hammer: i(Hammer, "build tools"), Puzzle: i(Puzzle, "integrations plugins"),
  // Files & objects
  Box: i(Box, "objects box custom"), Boxes: i(Boxes, "objects inventory"), Package: i(Package, "package supplies"), Archive: i(Archive, "archive storage"),
  Folder: i(Folder, "folder files"), FolderOpen: i(FolderOpen, "folder open"), FileText: i(FileText, "document file"), Files: i(Files, "documents files"),
  FileSpreadsheet: i(FileSpreadsheet, "spreadsheet excel import"), Paperclip: i(Paperclip, "attachment"), Bookmark: i(Bookmark, "saved bookmark"),
  Newspaper: i(Newspaper, "news blog"), Image: i(Image, "media images photos"), Camera: i(Camera, "photo camera"), Video: i(Video, "video telehealth"),
  Monitor: i(Monitor, "computer screen"), Smartphone: i(Smartphone, "mobile phone app"), Printer: i(Printer, "print fax"),
  // Education & sports
  BookOpen: i(BookOpen, "book guide education"), GraduationCap: i(GraduationCap, "education training school"), School: i(School, "school"),
  Award: i(Award, "award achievement"), Trophy: i(Trophy, "athletes sports trophy"), Medal: i(Medal, "athletes sports medal"),
  Dumbbell: i(Dumbbell, "fitness gym sports pt"), Bike: i(Bike, "cycling sports"), Footprints: i(Footprints, "walking gait"),
  Flag: i(Flag, "flag milestone"), Star: i(Star, "favorite star"), Heart: i(Heart, "favorite health"), Gem: i(Gem, "premium"),
  Lightbulb: i(Lightbulb, "ideas"), Rocket: i(Rocket, "launch growth"),
  // Places
  Building2: i(Building2, "practices company office"), Building: i(Building, "building"), Home: i(Home, "home house"), Store: i(Store, "store shop"),
  Landmark: i(Landmark, "bank government"), MapPin: i(MapPin, "locations place"), Map: i(Map, "map territory"), Globe: i(Globe, "web website world"),
  Compass: i(Compass, "explore"), Route: i(Route, "route territory"), Signpost: i(Signpost, "directions"), Truck: i(Truck, "delivery shipping"),
  Plane: i(Plane, "travel"), Car: i(Car, "car travel"),
  // Business
  Briefcase: i(Briefcase, "business hr talent jobs"), DollarSign: i(DollarSign, "money billing"), CreditCard: i(CreditCard, "payments card"),
  Receipt: i(Receipt, "billing invoice"), Wallet: i(Wallet, "wallet payments"), PiggyBank: i(PiggyBank, "savings"), ShoppingCart: i(ShoppingCart, "orders cart"),
  Tag: i(Tag, "tag label"), Tags: i(Tags, "tags labels"), Scale: i(Scale, "legal compliance"), Gavel: i(Gavel, "legal"),
  // System
  Shield: i(Shield, "security"), ShieldCheck: i(ShieldCheck, "security compliance"), Lock: i(Lock, "private locked"), Key: i(Key, "keys api access"),
  BadgeCheck: i(BadgeCheck, "verified credential"), Database: i(Database, "data database"), Server: i(Server, "server"), Cloud: i(Cloud, "cloud"),
  Network: i(Network, "network referral"), Share2: i(Share2, "share"), Link: i(Link, "link url"), Hash: i(Hash, "number id"), Search: i(Search, "search find"),
}

export const NAV_ICON_NAMES = Object.keys(NAV_ICONS)

export const isNavIcon = (name: unknown): name is string => typeof name === "string" && Object.prototype.hasOwnProperty.call(NAV_ICONS, name)

/** The component for a saved icon name; an unknown name shows a box. */
export function navIcon(name: string | null | undefined): LucideIcon {
  return (name && isNavIcon(name) ? NAV_ICONS[name].Icon : Box)
}
