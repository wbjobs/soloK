import SimCanvas from '@/components/SimCanvas';
import ControlPanel from '@/components/ControlPanel';

export default function Home() {
    return (
        <div className="w-screen h-screen flex bg-[#0a0e17] overflow-hidden">
            <div className="flex-1 relative">
                <SimCanvas />
            </div>
            <ControlPanel />
        </div>
    );
}
