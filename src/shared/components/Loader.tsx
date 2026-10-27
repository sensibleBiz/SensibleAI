const Loader = () => (
     <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="flex flex-col items-center justify-center gap-8">
        {/* Logo Container */}
        {/* <div className="relative w-64 h-32 flex items-center justify-center">
          <img src="./images/logo_bg.png" alt="Sensible Connect" width={256} height={128} className="object-contain" />
        </div> */}

        {/* Animated Spinner */}
        <div className="relative w-16 h-16">
          {/* Outer rotating ring */}
          <div className="absolute inset-0 border-4 border-transparent border-t-red-600 border-r-red-600 rounded-full animate-spin"></div>

          {/* Inner slower rotating ring */}
          <div
            className="absolute inset-2 border-3 border-transparent border-b-red-400 rounded-full animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "2s" }}
          ></div>

          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-red-600 rounded-full"></div>
          </div>
        </div>

        {/* Loading Text */}
        <div className="text-center">
          <p className="text-gray-700 font-medium">Loading</p>
          <p className="text-sm text-gray-500 mt-1">Empowering Retailers</p>
        </div>
      </div>
    </div>
);

export default Loader;
